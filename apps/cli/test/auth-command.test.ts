import { describe, expect, it } from 'vitest';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo, UserConfig } from 'owlie';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk) },
    stdin: { isTTY: false, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr, all: () => stdout + stderr };
}

function deps(auth: CliDeps['auth']): CliDeps {
  return { auth };
}

describe('auth command', () => {
  it('adds a prompted api key without echoing it', async () => {
    let written: UserConfig | undefined;
    const { io, all } = capture();
    const code = await run(
      ['auth', 'add', 'deepseek'],
      io,
      deps({
        prompt: async () => 'sk-secret',
        readConfig: () => ({}),
        writeConfig: (config) => (written = config),
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(written?.providers?.deepseek?.apiKey).toBe('sk-secret');
    expect(all()).not.toContain('sk-secret');
  });

  it('rejects an unknown provider', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['auth', 'add', 'anthropic'],
      io,
      deps({ prompt: async () => 'sk-test', readConfig: () => ({}), writeConfig: () => {} }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown provider');
  });

  it('rejects an empty api key', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['auth', 'add', 'deepseek'],
      io,
      deps({ prompt: async () => '   ', readConfig: () => ({}), writeConfig: () => {} }),
    );
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('API key is required');
  });

  it('lists providers with their effective source and never the key', async () => {
    const { io, stdout, all } = capture();
    const code = await run(
      ['auth', 'list'],
      io,
      deps({
        env: { DEEPSEEK_API_KEY: 'sk-env-secret' },
        readConfig: () => ({ providers: { openai: { apiKey: 'sk-stored-secret' } } }),
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek: configured (environment)');
    expect(stdout()).toContain('openai: configured (stored)');
    expect(all()).not.toContain('sk-env-secret');
    expect(all()).not.toContain('sk-stored-secret');
  });

  it('lists a provider with no credential as not configured', async () => {
    const { io, stdout } = capture();
    const code = await run(['auth', 'list'], io, deps({ env: {}, readConfig: () => ({}) }));
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('deepseek: not configured');
    expect(stdout()).toContain('openai: not configured');
  });

  it('removes a stored credential and preserves the model', async () => {
    let written: UserConfig | undefined;
    const { io, stdout } = capture();
    const code = await run(
      ['auth', 'remove', 'deepseek'],
      io,
      deps({
        readConfig: () => ({ providers: { deepseek: { model: 'deepseek-chat', apiKey: 'sk-x' } } }),
        writeConfig: (config) => (written = config),
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(written?.providers?.deepseek?.apiKey).toBeUndefined();
    expect(written?.providers?.deepseek?.model).toBe('deepseek-chat');
    expect(stdout()).not.toContain('sk-x');
  });

  it('emits JSON status for auth list with --json', async () => {
    const { io, stdout } = capture();
    const code = await run(
      ['auth', 'list', '--json'],
      io,
      deps({ env: {}, readConfig: () => ({ providers: { deepseek: { apiKey: 'sk-x' } } }) }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout())).toEqual([
      { provider: 'deepseek', source: 'stored' },
      { provider: 'openai', source: 'not set' },
    ]);
  });
});
