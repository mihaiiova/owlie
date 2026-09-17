import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { DeepSeekCatalog } from '@owlieio/provider-deepseek';

function fetcherWith(
  response: Partial<HttpTextResponse> & { text: string },
  calls: string[],
): HttpFetcher {
  return {
    async fetch(url): Promise<HttpTextResponse> {
      calls.push(url);
      return { url, contentType: 'application/json', ...response };
    },
  };
}

describe('DeepSeekCatalog.listModels', () => {
  it('returns the live model list with provider and ids', async () => {
    const calls: string[] = [];
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith(
        { text: JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }) },
        calls,
      ),
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(models.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(models.every((m) => m.provider === 'deepseek')).toBe(true);
    expect(calls).toEqual(['https://api.deepseek.com/models']);
  });

  it('passes through a brand-new model id absent from Owlie source', async () => {
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith(
        { text: JSON.stringify({ data: [{ id: 'deepseek-future-model' }] }) },
        [],
      ),
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(models.map((m) => m.id)).toEqual(['deepseek-future-model']);
  });

  it('uses an explicit base URL when provided', async () => {
    const calls: string[] = [];
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith(
        { text: JSON.stringify({ data: [{ id: 'deepseek-chat' }] }) },
        calls,
      ),
    });
    await catalog.listModels({ apiKey: 'sk-test', baseUrl: 'https://example.com' });
    expect(calls).toEqual(['https://example.com/models']);
  });

  it('sends the api key as a bearer token and never returns it', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const catalog = new DeepSeekCatalog({
      fetcher: {
        async fetch(url, options): Promise<HttpTextResponse> {
          calls.push({ url, headers: options?.headers ?? {} });
          return {
            url,
            contentType: 'application/json',
            text: JSON.stringify({ data: [{ id: 'deepseek-chat' }] }),
          };
        },
      },
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.stringify(models)).not.toContain('sk-test');
  });

  it('returns an empty list when the provider returns none', async () => {
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith({ text: JSON.stringify({ data: [] }) }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).resolves.toEqual([]);
  });

  it('rejects a non-JSON content type before parsing', async () => {
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith({ text: '<html>', contentType: 'text/html' }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).rejects.toThrow(/non-JSON response/);
  });

  it('rejects malformed JSON', async () => {
    const catalog = new DeepSeekCatalog({
      fetcher: fetcherWith({ text: 'not json' }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).rejects.toThrow(/malformed JSON/);
  });
});
