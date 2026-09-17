import { describe, expect, it } from 'vitest';
import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { OpenAICatalog } from '@owlieio/provider-openai';

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

describe('OpenAICatalog.listModels', () => {
  it('returns the live model list with provider and ids', async () => {
    const calls: string[] = [];
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith(
        { text: JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1' }] }) },
        calls,
      ),
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(models.map((m) => m.id)).toEqual(['gpt-4o-mini', 'gpt-4.1']);
    expect(models.every((m) => m.provider === 'openai')).toBe(true);
    expect(calls).toEqual(['https://api.openai.com/v1/models']);
  });

  it('normalizes optional name and capabilities only from provider fields', async () => {
    const calls: string[] = [];
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith(
        {
          text: JSON.stringify({
            data: [
              {
                id: 'gpt-4o-mini',
                name: 'GPT-4o mini',
                capabilities: { reasoning: true, vision: false, tools: true, unknown: true },
              },
            ],
          }),
        },
        calls,
      ),
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(models[0]).toEqual({
      provider: 'openai',
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      capabilities: { reasoning: true, vision: false, tools: true },
    });
  });

  it('uses an explicit base URL when provided', async () => {
    const calls: string[] = [];
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith({ text: JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }) }, calls),
    });
    await catalog.listModels({ apiKey: 'sk-test', baseUrl: 'https://example.com/v1' });
    expect(calls).toEqual(['https://example.com/v1/models']);
  });

  it('sends the api key as a bearer token and never returns it', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const catalog = new OpenAICatalog({
      fetcher: {
        async fetch(url, options): Promise<HttpTextResponse> {
          calls.push({ url, headers: options?.headers ?? {} });
          return {
            url,
            contentType: 'application/json',
            text: JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }),
          };
        },
      },
    });
    const models = await catalog.listModels({ apiKey: 'sk-test' });
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.stringify(models)).not.toContain('sk-test');
  });

  it('returns an empty list when the provider returns none', async () => {
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith({ text: JSON.stringify({ data: [] }) }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).resolves.toEqual([]);
  });

  it('rejects a non-JSON content type before parsing', async () => {
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith({ text: '<html>', contentType: 'text/html' }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).rejects.toThrow(/non-JSON response/);
  });

  it('rejects malformed JSON', async () => {
    const catalog = new OpenAICatalog({
      fetcher: fetcherWith({ text: 'not json' }, []),
    });
    await expect(catalog.listModels({ apiKey: 'sk-test' })).rejects.toThrow(/malformed JSON/);
  });
});
