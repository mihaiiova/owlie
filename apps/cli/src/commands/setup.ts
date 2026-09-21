import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import type { TranscriptProxy } from '@owlieio/adapter-youtube';
import type { HttpFetchPolicy, ModelInfo } from '@owlieio/core';
import { CancelledError } from '@owlieio/core';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { readUserConfig, writeUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { getProviderCatalog, listProviders } from '../registry.js';
import type { ProviderInfo } from '../registry.js';
import { writeDiagnostic } from '../style.js';

export interface SetupDeps {
  /** Detects a local executable without installing it. */
  toolAvailable?: (tool: string, args?: readonly string[]) => Promise<boolean>;
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
    options: { apiKey: string; baseUrl?: string; signal?: AbortSignal; policy?: HttpFetchPolicy },
  ) => Promise<ModelInfo[]>;
  signal?: AbortSignal;
  /** Invocation-wide network fetch policy (deadline + max download bytes). */
  networkPolicy?: HttpFetchPolicy;
}

/** Top-level `owlie setup` sections (future sections append here). */
const SETUP_SECTIONS: readonly string[] = ['LLM provider', 'Proxy', 'Transcription'];
export const WHISPER_MODELS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large-v3',
  'large-v3-turbo',
] as const;

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

/** Probes an executable and treats any nonzero exit as unavailable. */
export async function defaultToolAvailable(
  tool: string,
  args: readonly string[] = ['--version'],
  spawnTool: typeof spawn = spawn,
): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawnTool(tool, [...args], { stdio: 'ignore' });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${tool} exited with code ${code ?? 'unknown'}`));
      });
    });
    return true;
  } catch {
    return false;
  }
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
  const listModels =
    deps.listModels ??
    ((provider, options) =>
      getProviderCatalog(provider.id).listModels(
        { apiKey: options.apiKey, baseUrl: options.baseUrl },
        { signal: options.signal, policy: options.policy },
      ));
  const toolAvailable = deps.toolAvailable ?? defaultToolAvailable;

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
        if (!options.quiet) writeDiagnostic(io, 'warning', `unknown provider "${providerId}"`);
        return ExitCode.Usage;
      }

      const existingProfile = existing.providers?.[providerId] ?? {};

      // auth (API key; never shown as a default)
      const apiKeyInput = await prompt(
        existingProfile.apiKey ? 'API key (already set; press Enter to keep)' : 'API key',
      );
      const apiKey = apiKeyInput.trim() || existingProfile.apiKey;
      if (!apiKey) {
        if (!options.quiet) writeDiagnostic(io, 'warning', 'API key is required');
        return ExitCode.Usage;
      }

      // model: the authenticated live list is authoritative; no fallback,
      // cache, or free-form entry.
      let modelInfos: ModelInfo[];
      try {
        modelInfos = await listModels(provider, {
          baseUrl: existingProfile.baseUrl ?? provider.baseUrl,
          apiKey,
          signal: deps.signal,
          policy: deps.networkPolicy,
        });
      } catch (error) {
        if (error instanceof CancelledError || deps.signal?.aborted) throw error;
        if (!options.quiet) {
          const message = error instanceof Error ? error.message : String(error);
          writeDiagnostic(io, 'error', `failed to list models for "${providerId}": ${message}`);
        }
        return ExitCode.Error;
      }
      if (modelInfos.length === 0) {
        if (!options.quiet)
          writeDiagnostic(io, 'error', `provider "${providerId}" returned no selectable models`);
        return ExitCode.Error;
      }

      const models = modelInfos.map((modelInfo) => modelInfo.id);
      const model = await select('Model', models, { default: existingProfile.model ?? models[0] });
      if (!models.includes(model)) {
        if (!options.quiet) writeDiagnostic(io, 'warning', `unknown model "${model}"`);
        return ExitCode.Usage;
      }

      writeConfig({
        ...existing,
        provider: providerId,
        providers: {
          ...(existing.providers ?? {}),
          [providerId]: { ...existingProfile, model, apiKey },
        },
      });
      io.stdout.write('owlie setup complete\n');
      return ExitCode.Success;
    }

    if (section === 'Transcription') {
      const [python, ffmpeg, ffprobe, whisper] = await Promise.all([
        toolAvailable('python3'),
        toolAvailable('ffmpeg', ['-version']),
        toolAvailable('ffprobe', ['-version']),
        toolAvailable('python3', ['-c', 'import faster_whisper']),
      ]);
      if (!python || !ffmpeg || !ffprobe || !whisper) {
        if (!options.quiet)
          writeDiagnostic(
            io,
            'error',
            `transcription tools missing: ${[
              ['python3', python],
              ['faster-whisper', whisper],
              ['ffmpeg', ffmpeg],
              ['ffprobe', ffprobe],
            ]
              .filter(([, available]) => !available)
              .map(([tool]) => tool)
              .join(', ')}`,
          );
        return ExitCode.Error;
      }
      const model = await select('Whisper model', WHISPER_MODELS, {
        default: existing.transcription?.model ?? 'small',
      });
      if (!WHISPER_MODELS.includes(model as (typeof WHISPER_MODELS)[number])) {
        if (!options.quiet) writeDiagnostic(io, 'warning', `unknown whisper model "${model}"`);
        return ExitCode.Usage;
      }
      writeConfig({ ...existing, transcription: { provider: 'whisper-local', model } });
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
            writeDiagnostic(io, 'warning', 'WebShare username and password are required');
          return ExitCode.Usage;
        }
        proxy = { type: 'webshare', username, password };
      } else if (proxyType === 'generic') {
        const url = (await prompt('Proxy URL')).trim();
        if (!url) {
          if (!options.quiet) writeDiagnostic(io, 'warning', 'proxy URL is required');
          return ExitCode.Usage;
        }
        proxy = { type: 'generic', url };
      }

      writeConfig({ ...existing, proxy });
      io.stdout.write('owlie setup complete\n');
      return ExitCode.Success;
    }

    if (!options.quiet) writeDiagnostic(io, 'warning', `unknown section "${section}"`);
    return ExitCode.Usage;
  } catch (error) {
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      writeDiagnostic(io, 'error', message);
    }
    return exitCodeForError(error);
  }
}
