import readline from 'node:readline/promises';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { readUserConfig, writeUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { listProviders } from '../registry.js';
import type { ProviderInfo } from '../registry.js';

export interface SetupDeps {
  providers?: ProviderInfo[];
  readConfig?: () => UserConfig;
  writeConfig?: (config: UserConfig) => void;
  prompt?: (question: string, options?: { default?: string }) => Promise<string>;
  select?: (
    question: string,
    options: readonly string[],
    opts?: { default?: string },
  ) => Promise<string>;
  listModels?: (
    provider: ProviderInfo,
    options: { baseUrl?: string; apiKey: string },
  ) => Promise<string[]>;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
};

/** Top-level `owlie setup` sections (future sections append here). */
const SETUP_SECTIONS: readonly string[] = ['LLM provider', 'Proxy'];

/** Fetches a provider's live model list from its OpenAI-compatible `/models`. */
export async function listDeepseekModels(
  provider: ProviderInfo,
  options: { baseUrl?: string; apiKey: string },
): Promise<string[]> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URLS[provider.id];
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`failed to list models (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { data?: { id?: string }[] };
  return (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string');
}

async function resolveModels(
  provider: ProviderInfo,
  options: { baseUrl?: string; apiKey: string },
  listModels: SetupDeps['listModels'],
): Promise<string[]> {
  try {
    const models = await listModels?.(provider, options);
    if (models && models.length > 0) return models;
  } catch {
    // fall through to the known models
  }
  return [...provider.models];
}

/** Interactive free-text prompt backed by stdin/stderr (used as the default). */
export function defaultPrompt(question: string, options?: { default?: string }): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const suffix = options?.default ? ` [${options.default}]` : '';
  return rl
    .question(`${question}${suffix}: `)
    .then((answer) => {
      rl.close();
      return answer.trim() || options?.default || '';
    })
    .catch((error) => {
      rl.close();
      throw error;
    });
}

/** Interactive numbered menu backed by stdin/stderr (used as the default). */
export function defaultSelect(
  question: string,
  options: readonly string[],
  opts?: { default?: string },
): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const list = options.map((option, index) => `  ${index + 1}. ${option}`).join('\n');
  const defaultIndex = opts?.default ? options.indexOf(opts.default) : -1;
  const defaultLabel = defaultIndex >= 0 ? ` [${defaultIndex + 1}]` : '';
  return rl.question(`${question}:\n${list}\nSelect${defaultLabel}: `).then((answer) => {
    rl.close();
    const trimmed = answer.trim();
    if (trimmed === '') return opts?.default ?? options[0] ?? '';
    const numeric = Number(trimmed);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
      return options[numeric - 1] ?? trimmed;
    }
    return trimmed;
  });
}

export async function runSetupCommand(
  io: CliIo,
  options: CliOptions,
  deps: SetupDeps = {},
): Promise<number> {
  const providers = deps.providers ?? listProviders();
  const readConfig = deps.readConfig ?? readUserConfig;
  const writeConfig = deps.writeConfig ?? writeUserConfig;
  const prompt = deps.prompt ?? defaultPrompt;
  const select = deps.select ?? defaultSelect;
  const listModels = deps.listModels ?? listDeepseekModels;

  const existing = readConfig();

  try {
    // 1. top-level section
    const section = await select('Setup', SETUP_SECTIONS, { default: SETUP_SECTIONS[0] });

    if (section === 'LLM provider') {
      const providerNames = providers.map((provider) => provider.id);
      const providerId = await select('LLM provider', providerNames, {
        default: existing.provider ?? providerNames[0],
      });
      const provider = providers.find((entry) => entry.id === providerId);
      if (!provider) {
        if (!options.quiet) io.stderr.write(`owlie: unknown provider "${providerId}"\n`);
        return ExitCode.Usage;
      }

      // auth (API key; never shown as a default)
      const apiKeyInput = await prompt('API key');
      const apiKey = apiKeyInput.trim() || existing.apiKey;
      if (!apiKey) {
        if (!options.quiet) io.stderr.write('owlie: API key is required\n');
        return ExitCode.Usage;
      }

      // model (live list with a fallback to the known list)
      const models = await resolveModels(
        provider,
        { baseUrl: existing.baseUrl, apiKey },
        listModels,
      );
      const model = await select('Model', models, { default: existing.model ?? models[0] });
      if (!models.includes(model)) {
        if (!options.quiet) io.stderr.write(`owlie: unknown model "${model}"\n`);
        return ExitCode.Usage;
      }

      writeConfig({ ...existing, provider: providerId, model, apiKey, baseUrl: existing.baseUrl });
      io.stdout.write('owlie setup complete\n');
      return ExitCode.Success;
    }

    if (section === 'Proxy') {
      const proxyType = await select('Proxy', ['none', 'webshare', 'generic'], {
        default: existing.proxy?.type ?? 'none',
      });
      let proxy: TranscriptProxy | undefined;
      if (proxyType === 'webshare') {
        const username = (await prompt('WebShare username')).trim();
        const password = (await prompt('WebShare password')).trim();
        if (!username || !password) {
          if (!options.quiet)
            io.stderr.write('owlie: WebShare username and password are required\n');
          return ExitCode.Usage;
        }
        proxy = { type: 'webshare', username, password };
      } else if (proxyType === 'generic') {
        const url = (await prompt('Proxy URL')).trim();
        if (!url) {
          if (!options.quiet) io.stderr.write('owlie: proxy URL is required\n');
          return ExitCode.Usage;
        }
        proxy = { type: 'generic', url };
      }

      writeConfig({ ...existing, proxy });
      io.stdout.write('owlie setup complete\n');
      return ExitCode.Success;
    }

    if (!options.quiet) io.stderr.write(`owlie: unknown section "${section}"\n`);
    return ExitCode.Usage;
  } catch (error) {
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}
