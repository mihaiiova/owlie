import type { CliIo } from '../io.js';
import { ExitCode } from '../io.js';
import type { CliOptions } from '../cli.js';
import { loadDotEnv, readUserConfig, writeUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { removeCredential, resolveCredentialSource, setCredential } from '../auth.js';
import type { CredentialSource } from '../auth.js';
import { assertKnownProvider, listProviders } from '../registry.js';
import type { ProviderInfo } from '../registry.js';
import { defaultPrompt } from './setup.js';

/** Injectable dependencies for `owlie auth` (mirrors `ProcessDeps`/`SetupDeps`). */
export interface AuthDeps {
  readConfig?: () => UserConfig;
  writeConfig?: (config: UserConfig) => void;
  prompt?: (question: string, options?: { default?: string }) => Promise<string>;
  env?: Record<string, string | undefined>;
  loadFile?: (path: string) => Record<string, string>;
  providers?: ProviderInfo[];
}

function formatSource(source: CredentialSource): string {
  switch (source) {
    case 'environment':
      return 'configured (environment)';
    case 'stored':
      return 'configured (stored)';
    case 'not set':
      return 'not configured';
  }
}

/**
 * `owlie auth add <provider> | list | remove <provider>`. Manages API keys in
 * the existing user-level credential store. Secrets are never written to
 * stdout/stderr; `list` reports only the effective source per provider.
 */
export async function runAuthCommand(
  args: string[],
  io: CliIo,
  options: CliOptions,
  deps: AuthDeps = {},
): Promise<number> {
  const readConfig = deps.readConfig ?? readUserConfig;
  const writeConfig = deps.writeConfig ?? writeUserConfig;
  const prompt = deps.prompt ?? defaultPrompt;
  const env = deps.env ?? process.env;
  const loadFile = deps.loadFile ?? loadDotEnv;
  const providers = deps.providers ?? listProviders();

  const [subcommand, providerArg, extra] = args;

  if (subcommand === 'list') {
    if (providerArg !== undefined || extra !== undefined) {
      if (!options.quiet) io.stderr.write('owlie: auth list takes no arguments\n');
      return ExitCode.Usage;
    }
    const statuses = providers.map((provider) => ({
      provider: provider.id,
      source: resolveCredentialSource(provider.id, {}, env, loadFile, readConfig),
    }));
    if (options.json) {
      io.stdout.write(JSON.stringify(statuses) + '\n');
    } else {
      for (const status of statuses) {
        io.stdout.write(`${status.provider}: ${formatSource(status.source)}\n`);
      }
    }
    return ExitCode.Success;
  }

  if (subcommand === 'add' || subcommand === 'remove') {
    if (providerArg === undefined) {
      if (!options.quiet) io.stderr.write(`owlie: auth ${subcommand} requires a provider\n`);
      return ExitCode.Usage;
    }
    if (extra !== undefined) {
      if (!options.quiet) io.stderr.write(`owlie: unexpected argument "${extra}"\n`);
      return ExitCode.Usage;
    }
    try {
      assertKnownProvider(providerArg);
    } catch (error) {
      if (!options.quiet) {
        const message = error instanceof Error ? error.message : String(error);
        io.stderr.write(`owlie: ${message}\n`);
      }
      return ExitCode.Usage;
    }

    const existing = readConfig();
    if (subcommand === 'add') {
      const key = (await prompt(`API key for ${providerArg}`)).trim();
      if (!key) {
        if (!options.quiet) io.stderr.write('owlie: API key is required\n');
        return ExitCode.Usage;
      }
      writeConfig(setCredential(existing, providerArg, key));
      io.stdout.write(`stored API key for ${providerArg}\n`);
    } else {
      writeConfig(removeCredential(existing, providerArg));
      io.stdout.write(`removed stored API key for ${providerArg}\n`);
    }
    return ExitCode.Success;
  }

  if (!options.quiet) {
    io.stderr.write(`owlie: unknown auth command "${subcommand ?? ''}"\n`);
    io.stderr.write('Usage: owlie auth <add|list|remove> [provider]\n');
  }
  return ExitCode.Usage;
}
