import type { ModelInfo, ProviderCatalog } from '@owlieio/core';
import { ConfigurationError, ExtractionError } from '@owlieio/core';
import type { CliIo } from '../io.js';
import { ExitCode, exitCodeForError } from '../io.js';
import type { CliOptions } from '../cli.js';
import { loadDotEnv, readUserConfig, resolveProviderSettings } from '../config.js';
import type { UserConfig } from '../config.js';
import { resolveCredentialSource } from '../auth.js';
import { assertKnownProvider, getProviderCatalog, listProviders } from '../registry.js';
import type { ProviderInfo } from '../registry.js';
import { isCacheFresh, modelsCachePath, readModelCache, writeModelCache } from '../model-cache.js';

/** Injectable dependencies for `owlie models` (mirrors `ProcessDeps`/`SetupDeps`). */
export interface ModelsDeps {
  providers?: ProviderInfo[];
  getCatalog?: (providerId: string) => ProviderCatalog;
  readConfig?: () => UserConfig;
  env?: Record<string, string | undefined>;
  loadFile?: (path: string) => Record<string, string>;
  cachePath?: string;
  now?: () => number;
}

/**
 * `owlie models [--provider <provider>] [--refresh] [--json]`. Lists a
 * provider's current models from its live listing endpoint through the
 * provider-neutral catalog contract, backed by a short-TTL cache. `--refresh`
 * forces a live fetch; a failed fetch falls back to a cached list (with a
 * clear diagnostic) and fails when there is no cache.
 */
export async function runModelsCommand(
  io: CliIo,
  options: CliOptions,
  deps: ModelsDeps = {},
): Promise<number> {
  const providers = deps.providers ?? listProviders();
  const getCatalog = deps.getCatalog ?? getProviderCatalog;
  const readConfig = deps.readConfig ?? readUserConfig;
  const env = deps.env ?? process.env;
  const loadFile = deps.loadFile ?? loadDotEnv;
  const cachePath = deps.cachePath ?? modelsCachePath();
  const now = deps.now ?? Date.now;

  try {
    let targets: ProviderInfo[];
    if (options.provider) {
      const id = options.provider.trim();
      try {
        assertKnownProvider(id);
      } catch (error) {
        if (!options.quiet) {
          const message = error instanceof Error ? error.message : String(error);
          io.stderr.write(`owlie: ${message}\n`);
        }
        return ExitCode.Usage;
      }
      targets = providers.filter((provider) => provider.id === id);
    } else {
      targets = providers.filter(
        (provider) =>
          resolveCredentialSource(
            provider.id,
            { envFile: options.envFile },
            env,
            loadFile,
            readConfig,
          ) !== 'not set',
      );
      if (targets.length === 0) {
        if (!options.quiet) {
          io.stderr.write('owlie: no configured providers (run "owlie auth add <provider>")\n');
        }
        return ExitCode.Error;
      }
    }

    const cache = readModelCache(cachePath);
    const results: ModelInfo[] = [];
    const fallbacks: string[] = [];

    for (const provider of targets) {
      const settings = resolveProviderSettings(
        provider.id,
        { envFile: options.envFile },
        env,
        loadFile,
        readConfig,
      );
      if (!settings.apiKey || settings.apiKey.trim() === '') {
        throw new ConfigurationError(
          `no API key for provider "${provider.id}" (run "owlie auth add ${provider.id}" or set ${provider.id.toUpperCase()}_API_KEY)`,
        );
      }
      const catalog = getCatalog(provider.id);
      const cached = cache[provider.id];
      let models: ModelInfo[];
      if (!options.refresh && isCacheFresh(cached, now())) {
        models = cached.models;
      } else {
        try {
          models = await catalog.listModels({
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl ?? provider.baseUrl,
          });
          cache[provider.id] = { models, fetchedAt: now() };
        } catch (error) {
          if (cached) {
            models = cached.models;
            fallbacks.push(
              `using cached list from ${new Date(cached.fetchedAt).toISOString()} for "${provider.id}"`,
            );
          } else {
            const message = error instanceof Error ? error.message : String(error);
            throw new ExtractionError(`failed to list models for "${provider.id}": ${message}`, {
              cause: error,
            });
          }
        }
      }
      results.push(...models);
    }

    writeModelCache(cache, cachePath);

    for (const diagnostic of fallbacks) {
      if (!options.quiet) io.stderr.write(diagnostic + '\n');
    }

    if (options.json) {
      io.stdout.write(JSON.stringify(results) + '\n');
    } else if (options.provider) {
      io.stdout.write(results.map((model) => model.id).join('\n') + '\n');
    } else {
      io.stdout.write(results.map((model) => `${model.provider}/${model.id}`).join('\n') + '\n');
    }
    return ExitCode.Success;
  } catch (error) {
    if (!options.quiet) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`owlie: ${message}\n`);
    }
    return exitCodeForError(error);
  }
}
