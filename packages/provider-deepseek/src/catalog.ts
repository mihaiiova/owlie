import type { ModelInfo, ProviderCatalog } from '@owlieio/core';
import { DefaultHttpFetcher, isJsonContentType } from '@owlieio/core';
import type { HttpFetcher } from '@owlieio/core';

/** Default base URL for DeepSeek's authenticated `/models` listing. */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function normalizeCapabilities(
  value: unknown,
): { reasoning?: boolean; vision?: boolean; tools?: boolean } | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const capabilities: { reasoning?: boolean; vision?: boolean; tools?: boolean } = {};
  let found = false;
  for (const key of ['reasoning', 'vision', 'tools'] as const) {
    if (typeof raw[key] === 'boolean') {
      capabilities[key] = raw[key];
      found = true;
    }
  }
  return found ? capabilities : undefined;
}

/**
 * DeepSeek live model catalog. Implements the provider-neutral
 * {@link ProviderCatalog} contract over the authenticated
 * `GET {baseUrl}/models` endpoint through the safe core {@link HttpFetcher}
 * seam. The declared content type is validated as JSON before parsing, and
 * model ids come exclusively from the provider response (no allowlist). The
 * API key is used only as the bearer token and is never returned or logged.
 */
export class DeepSeekCatalog implements ProviderCatalog {
  readonly providerId = 'deepseek';
  private readonly fetcher: HttpFetcher;

  constructor(options: { fetcher?: HttpFetcher } = {}) {
    this.fetcher = options.fetcher ?? new DefaultHttpFetcher();
  }

  async listModels(credentials: { apiKey: string; baseUrl?: string }): Promise<ModelInfo[]> {
    const baseUrl = credentials.baseUrl ?? DEEPSEEK_BASE_URL;
    const response = await this.fetcher.fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
    });
    if (!isJsonContentType(response.contentType)) {
      throw new Error('DeepSeek model discovery returned a non-JSON response');
    }
    let body: unknown;
    try {
      body = JSON.parse(response.text);
    } catch {
      throw new Error('DeepSeek model discovery returned malformed JSON');
    }
    const parsed =
      body !== null && typeof body === 'object' ? (body as { data?: unknown[] }) : {};
    const models: ModelInfo[] = [];
    for (const entry of parsed.data ?? []) {
      if (entry === null || typeof entry !== 'object') continue;
      const model = entry as { id?: unknown; name?: unknown; capabilities?: unknown };
      if (typeof model.id !== 'string') continue;
      models.push({
        provider: this.providerId,
        id: model.id,
        name: typeof model.name === 'string' ? model.name : undefined,
        capabilities: normalizeCapabilities(model.capabilities),
      });
    }
    return models;
  }
}
