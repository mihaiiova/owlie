import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { writeCommandError, writeResultEnvelope, writeUsageError } from '../protocol.js';
import { loadDotEnv, readUserConfig, writeUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { removeCredential, resolveCredentialSource, setCredential } from '../auth.js';
import type { CredentialSource } from '../auth.js';
import { assertKnownProvider, listProviders } from '../registry.js';
import type { ProviderInfo } from '../registry.js';
import { defaultPrompt, throwIfCancelled } from './setup.js';

/** Injectable dependencies for `owlie auth` (mirrors `ProcessDeps`/`SetupDeps`). */
export interface AuthDeps {
  readConfig?: () => UserConfig;
  writeConfig?: (config: UserConfig) => void;
  prompt?: (
    question: string,
    options?: { default?: string; signal?: AbortSignal },
  ) => Promise<string>;
  env?: Record<string, string | undefined>;
  loadFile?: (path: string) => Record<string, string>;
  providers?: ProviderInfo[];
  /** Invocation signal (deadline + SIGINT/SIGTERM); ends a pending prompt. */
  signal?: AbortSignal;
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
      if (!options.quiet) writeUsageError(io, options, 'auth', 'auth list takes no arguments');
      return ExitCode.Usage;
    }
    const statuses = providers.map((provider) => ({
      provider: provider.id,
      source: resolveCredentialSource(
        provider.id,
        { envFile: options.envFile },
        env,
        loadFile,
        readConfig,
      ),
    }));
    if (options.json) {
      writeResultEnvelope(io, 'auth', statuses);
    } else {
      for (const status of statuses) {
        io.stdout.write(`${status.provider}: ${formatSource(status.source)}\n`);
      }
    }
    return ExitCode.Success;
  }

  if (subcommand === 'add' || subcommand === 'remove') {
    if (providerArg === undefined) {
      if (!options.quiet)
        writeUsageError(io, options, 'auth', `auth ${subcommand} requires a provider`);
      return ExitCode.Usage;
    }
    if (extra !== undefined) {
      if (!options.quiet) writeUsageError(io, options, 'auth', `unexpected argument "${extra}"`);
      return ExitCode.Usage;
    }
    try {
      assertKnownProvider(providerArg);
    } catch (error) {
      if (!options.quiet) {
        const message = error instanceof Error ? error.message : String(error);
        writeUsageError(io, options, 'auth', message);
      }
      return ExitCode.Usage;
    }

    // Prompt rejections, cancellation and config read/write failures (read-only
    // directory, full disk) are reported like any other command failure: a
    // versioned terminal record in --json mode, a diagnostic otherwise.
    try {
      const existing = readConfig();
      if (subcommand === 'add') {
        const key = (await prompt(`API key for ${providerArg}`, { signal: deps.signal })).trim();
        if (!key) {
          if (!options.quiet) writeUsageError(io, options, 'auth', 'API key is required');
          return ExitCode.Usage;
        }
        throwIfCancelled(deps.signal);
        writeConfig(setCredential(existing, providerArg, key));
        if (options.json)
          writeResultEnvelope(io, 'auth', { action: 'added', provider: providerArg });
        else io.stdout.write(`stored API key for ${providerArg}\n`);
      } else {
        throwIfCancelled(deps.signal);
        writeConfig(removeCredential(existing, providerArg));
        if (options.json)
          writeResultEnvelope(io, 'auth', { action: 'removed', provider: providerArg });
        else io.stdout.write(`removed stored API key for ${providerArg}\n`);
      }
    } catch (error) {
      writeCommandError(io, options, 'auth', error);
      return exitCodeForError(error);
    }
    return ExitCode.Success;
  }

  if (!options.quiet) {
    if (options.json)
      writeUsageError(io, options, 'auth', `unknown auth command "${subcommand ?? ''}"`);
    else {
      io.stderr.write(`owlie: unknown auth command "${subcommand ?? ''}"\n`);
      io.stderr.write('Usage: owlie auth <add|list|remove> [provider]\n');
    }
  }
  return ExitCode.Usage;
}
