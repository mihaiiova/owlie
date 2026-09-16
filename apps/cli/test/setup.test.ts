import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'owlie';
import { defaultToolAvailable, ExitCode, listProviderModels, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';
import {
  CancelledError,
  DefaultHttpFetcher,
  ExtractionError,
  type HttpFetchFn,
} from '@owlieio/core';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

const PROVIDERS = [
  { id: 'deepseek', baseUrl: 'https://api.deepseek.com' },
  { id: 'openai', baseUrl: 'https://api.openai.com/v1' },
];

function scriptedSelect(answers: string[]) {
  let i = 0;
  return async () => answers[i++] ?? '';
}

function makeSetup(opts: {
  select?: (q: string, options: readonly string[], o?: { default?: string }) => Promise<string>;
  prompt?: (q: string, o?: { default?: string }) => Promise<string>;
  listModels?: () => Promise<string[]>;
  toolAvailable?: (tool: string, args?: readonly string[]) => Promise<boolean>;
  readConfig?: () => UserConfig;
}) {
  const writes: UserConfig[] = [];
  const deps: CliDeps = {
    setup: {
      providers: PROVIDERS,
      select: opts.select,
      prompt: opts.prompt,
      listModels: opts.listModels,
      toolAvailable: opts.toolAvailable,
      readConfig: opts.readConfig ?? (() => ({})),
      writeConfig: (config) => writes.push(config),
    },
  };
  return { deps, writes };
}

describe('default setup prerequisite probe', () => {
  it('treats a nonzero tool exit as unavailable through its spawn seam', async () => {
    const spawnTool = (() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 1));
      return child;
    }) as unknown as typeof import('node:child_process').spawn;

    await expect(defaultToolAvailable('ffmpeg', ['--version'], spawnTool)).resolves.toBe(false);
  });
});

describe('owlie setup', () => {
  it('navigates section → provider → key → live models → model, then persists a profile', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-v3']),
      prompt: async () => 'sk-abc',
      listModels: async () => ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3'],
    });
    const { io, stdout } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]).toEqual({
      provider: 'deepseek',
      providers: { deepseek: { model: 'deepseek-v3', apiKey: 'sk-abc' } },
    });
    expect(stdout()).toContain('setup complete');
  });

  it('saves both providers independently without overwriting either profile', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'openai', 'gpt-4o-mini']),
      prompt: async () => 'sk-openai',
      listModels: async () => ['gpt-4o', 'gpt-4o-mini'],
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-deepseek' } },
      }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]).toEqual({
      provider: 'openai',
      providers: {
        deepseek: { model: 'deepseek-chat', apiKey: 'sk-deepseek' },
        openai: { model: 'gpt-4o-mini', apiKey: 'sk-openai' },
      },
    });
  });

  it('fails without a fallback when live model discovery errors', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek']),
      prompt: async () => 'sk-abc',
      listModels: async () => {
        throw new Error('offline');
      },
    });
    const { io, stdout, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('failed to list models');
    expect(stdout()).toBe('');
    expect(writes).toHaveLength(0);
  });

  it('fails when live model discovery returns an empty list', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'openai']),
      prompt: async () => 'sk-abc',
      listModels: async () => [],
    });
    const { io, stdout, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('no selectable models');
    expect(stdout()).toBe('');
    expect(writes).toHaveLength(0);
  });

  it('rejects an unknown section', async () => {
    const { deps } = makeSetup({ select: scriptedSelect(['Bogus']) });
    const { io, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown section');
  });

  it('persists the selected Whisper model in the Transcription section', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Transcription', 'medium']),
      toolAvailable: async () => true,
      readConfig: () => ({}),
    });
    const { io, stdout } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.transcription).toEqual({ provider: 'whisper-local', model: 'medium' });
    expect(stdout()).toContain('setup complete');
  });

  it('reports missing transcription tools without persisting', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Transcription']),
      toolAvailable: async (tool) => tool !== 'ffmpeg',
      readConfig: () => ({}),
    });
    const { io, stderr, stdout } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Error);
    expect(stderr()).toContain('transcription tools missing');
    expect(stderr()).toContain('ffmpeg');
    expect(stdout()).toBe('');
    expect(writes).toHaveLength(0);
  });

  it('probes ffmpeg and ffprobe with -version (not --version)', async () => {
    const calls: Array<[string, readonly string[] | undefined]> = [];
    const { deps } = makeSetup({
      select: scriptedSelect(['Transcription', 'medium']),
      toolAvailable: async (tool, args) => {
        calls.push([tool, args]);
        return true;
      },
      readConfig: () => ({}),
    });
    const { io } = capture();
    await run(['setup'], io, deps);
    expect(calls.find(([tool]) => tool === 'ffmpeg')?.[1]).toEqual(['-version']);
    expect(calls.find(([tool]) => tool === 'ffprobe')?.[1]).toEqual(['-version']);
  });

  it('rejects an unknown provider', async () => {
    const { deps } = makeSetup({ select: scriptedSelect(['LLM provider', 'anthropic']) });
    const { io, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown provider');
  });

  it('rejects an unknown model', async () => {
    const { deps } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'not-a-model']),
      prompt: async () => 'sk-abc',
      listModels: async () => ['deepseek-chat'],
    });
    const { io, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown model');
  });

  it('requires an API key', async () => {
    const { deps } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-chat']),
      prompt: async () => '',
      readConfig: () => ({}),
    });
    const { io, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('API key');
  });

  it('keeps the existing profile API key when the prompt is left empty', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-chat']),
      prompt: async () => '',
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-old' } },
      }),
      listModels: async () => ['deepseek-chat'],
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.providers?.deepseek?.apiKey).toBe('sk-old');
  });

  it('tells the user when an API key is already saved', async () => {
    let question = '';
    const { deps } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-chat']),
      prompt: async (q) => {
        question = q;
        return '';
      },
      readConfig: () => ({
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-old' } },
      }),
      listModels: async () => ['deepseek-chat'],
    });
    const { io } = capture();
    await run(['setup'], io, deps);
    expect(question).toContain('already set');
  });

  it('uses the existing profile as menu defaults', async () => {
    const selectCalls: { question: string; options: readonly string[]; default?: string }[] = [];
    const { deps } = makeSetup({
      select: async (question, options, o) => {
        selectCalls.push({ question, options, default: o?.default });
        return o?.default ?? options[0] ?? '';
      },
      prompt: async () => '',
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-reasoner', apiKey: 'sk-old' } },
      }),
      listModels: async () => ['deepseek-chat', 'deepseek-reasoner'],
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(selectCalls[0]?.question).toBe('Setup');
    expect(selectCalls[1]?.question).toBe('LLM provider');
    expect(selectCalls[1]?.default).toBe('deepseek');
    expect(selectCalls[2]?.question).toBe('Model');
    expect(selectCalls[2]?.default).toBe('deepseek-reasoner');
  });

  it('configures a WebShare proxy and preserves provider profiles', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Proxy', 'webshare']),
      prompt: async (question: string) => (question.includes('username') ? 'user' : 'pass'),
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
      }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.proxy).toEqual({ type: 'webshare', username: 'user', password: 'pass' });
    expect(writes[0]?.providers?.deepseek).toEqual({ model: 'deepseek-chat', apiKey: 'sk-x' });
  });

  it('configures a generic proxy', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Proxy', 'generic']),
      prompt: async () => 'http://proxy:8080',
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
      }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.proxy).toEqual({ type: 'generic', url: 'http://proxy:8080' });
  });

  it('clears the proxy when none is selected', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Proxy', 'none']),
      readConfig: () => ({
        provider: 'deepseek',
        providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } },
        proxy: { type: 'webshare', username: 'u', password: 'p' },
      }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.proxy).toBeUndefined();
  });
});

describe('listProviderModels', () => {
  const provider = { id: 'deepseek', baseUrl: 'https://api.deepseek.com' };
  const publicResolver = async () => ['8.8.8.8'];

  function jsonResponse(body: string, contentType = 'application/json') {
    return new Response(body, { status: 200, headers: { 'content-type': contentType } });
  }

  it('sends Authorization through the core seam and returns model ids', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchFn: HttpFetchFn = async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      return jsonResponse(
        JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }),
      );
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    const models = await listProviderModels(provider, { apiKey: 'sk-test', fetcher });

    expect(models).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(calls[0]!.url).toBe('https://api.deepseek.com/models');
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]!.headers['user-agent']).toBe('owlie-cli');
  });

  it('refuses a private/local base URL before fetching', async () => {
    let called = false;
    const fetchFn: HttpFetchFn = async () => {
      called = true;
      return jsonResponse('{}');
    };
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(
      listProviderModels(provider, { baseUrl: 'http://127.0.0.1', apiKey: 'sk-test', fetcher }),
    ).rejects.toThrow(ExtractionError);
    expect(called).toBe(false);
  });

  it('rejects a declared non-JSON content type before parsing', async () => {
    const fetchFn: HttpFetchFn = async () => jsonResponse('{"data":[]}', 'text/html');
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(listProviderModels(provider, { apiKey: 'sk-test', fetcher })).rejects.toThrow(
      /non-JSON response/,
    );
  });

  it('rejects a missing content type before parsing', async () => {
    const fetchFn: HttpFetchFn = async () => new Response('{"data":[]}', { status: 200 });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(listProviderModels(provider, { apiKey: 'sk-test', fetcher })).rejects.toThrow(
      /non-JSON response/,
    );
  });

  it('rejects malformed JSON', async () => {
    const fetchFn: HttpFetchFn = async () => jsonResponse('not-json');
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(listProviderModels(provider, { apiKey: 'sk-test', fetcher })).rejects.toThrow(
      /malformed JSON/,
    );
  });

  it('propagates the response size policy', async () => {
    const fetchFn: HttpFetchFn = async () =>
      jsonResponse(JSON.stringify({ data: [{ id: 'x'.repeat(200) }] }));
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(
      listProviderModels(provider, {
        apiKey: 'sk-test',
        fetcher,
        policy: { maxResponseBytes: 32 },
      }),
    ).rejects.toThrow(ExtractionError);
  });

  it('propagates the timeout policy', async () => {
    const fetchFn: HttpFetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')), {
          once: true,
        });
      });
    const fetcher = new DefaultHttpFetcher(fetchFn, publicResolver);

    await expect(
      listProviderModels(provider, { apiKey: 'sk-test', fetcher, policy: { timeoutMs: 20 } }),
    ).rejects.toThrow(CancelledError);
  });
});
