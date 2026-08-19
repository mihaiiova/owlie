import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'owlie';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

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

const PROVIDERS = [{ id: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'] }];

function scriptedSelect(answers: string[]) {
  let i = 0;
  return async () => answers[i++] ?? '';
}

function makeSetup(opts: {
  select?: (q: string, options: readonly string[], o?: { default?: string }) => Promise<string>;
  prompt?: (q: string, o?: { default?: string }) => Promise<string>;
  listModels?: () => Promise<string[]>;
  readConfig?: () => UserConfig;
}) {
  const writes: UserConfig[] = [];
  const deps: CliDeps = {
    setup: {
      providers: PROVIDERS,
      select: opts.select,
      prompt: opts.prompt,
      listModels: opts.listModels,
      readConfig: opts.readConfig ?? (() => ({})),
      writeConfig: (config) => writes.push(config),
    },
  };
  return { deps, writes };
}

describe('owlie setup', () => {
  it('navigates section → provider → key → live models → model, then persists', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-v3']),
      prompt: async () => 'sk-abc',
      listModels: async () => ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3'],
    });
    const { io, stdout } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]).toEqual({ provider: 'deepseek', model: 'deepseek-v3', apiKey: 'sk-abc' });
    expect(stdout()).toContain('setup complete');
  });

  it('falls back to known models when the live fetch fails', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-reasoner']),
      prompt: async () => 'sk-abc',
      listModels: async () => {
        throw new Error('offline');
      },
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      apiKey: 'sk-abc',
    });
  });

  it('rejects an unknown section', async () => {
    const { deps } = makeSetup({ select: scriptedSelect(['Bogus']) });
    const { io, stderr } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown section');
  });

  it('rejects an unknown provider', async () => {
    const { deps } = makeSetup({ select: scriptedSelect(['LLM provider', 'openai']) });
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

  it('keeps the existing API key when the prompt is left empty', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['LLM provider', 'deepseek', 'deepseek-chat']),
      prompt: async () => '',
      readConfig: () => ({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-old' }),
      listModels: async () => ['deepseek-chat'],
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.apiKey).toBe('sk-old');
  });

  it('uses the existing config as menu defaults', async () => {
    const selectCalls: { question: string; options: readonly string[]; default?: string }[] = [];
    const { deps } = makeSetup({
      select: async (question, options, o) => {
        selectCalls.push({ question, options, default: o?.default });
        return o?.default ?? options[0] ?? '';
      },
      prompt: async () => '',
      readConfig: () => ({ provider: 'deepseek', model: 'deepseek-reasoner', apiKey: 'sk-old' }),
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

  it('configures a WebShare proxy', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Proxy', 'webshare']),
      prompt: async (question: string) => (question.includes('username') ? 'user' : 'pass'),
      readConfig: () => ({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-x' }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.proxy).toEqual({ type: 'webshare', username: 'user', password: 'pass' });
    expect(writes[0]?.provider).toBe('deepseek');
  });

  it('configures a generic proxy', async () => {
    const { deps, writes } = makeSetup({
      select: scriptedSelect(['Proxy', 'generic']),
      prompt: async () => 'http://proxy:8080',
      readConfig: () => ({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-x' }),
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
        model: 'deepseek-chat',
        apiKey: 'sk-x',
        proxy: { type: 'webshare', username: 'u', password: 'p' },
      }),
    });
    const { io } = capture();
    const code = await run(['setup'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(writes[0]?.proxy).toBeUndefined();
  });
});
