import { describe, expect, it } from 'vitest';
import { CancelledError } from '@owlieio/core';
import { ExitCode, run } from 'owlie';
import type { CliDeps, CliIo, UserConfig } from 'owlie';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
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

  it('reports a key from --env-file as an environment credential', async () => {
    const { io, stdout } = capture();
    const code = await run(
      ['auth', 'list', '--json', '--env-file', 'credentials.env'],
      io,
      deps({
        env: {},
        readConfig: () => ({}),
        loadFile: (path): Record<string, string> =>
          path === 'credentials.env' ? { OPENAI_API_KEY: 'sk-file' } : {},
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result).toContainEqual({
      provider: 'openai',
      source: 'environment',
    });
    expect(stdout()).not.toContain('sk-file');
  });

  it('emits JSON status for auth list with --json', async () => {
    const { io, stdout } = capture();
    const code = await run(
      ['auth', 'list', '--json'],
      io,
      deps({ env: {}, readConfig: () => ({ providers: { deepseek: { apiKey: 'sk-x' } } }) }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result).toEqual([
      { provider: 'deepseek', source: 'stored' },
      { provider: 'openai', source: 'not set' },
    ]);
  });

  it.each([
    ['add', { action: 'added', provider: 'deepseek' }],
    ['remove', { action: 'removed', provider: 'deepseek' }],
  ])('wraps auth %s success in the JSON protocol envelope', async (subcommand, result) => {
    const { io, stdout, all } = capture();
    const code = await run(
      ['auth', subcommand, 'deepseek', '--json'],
      io,
      deps({
        prompt: async () => 'sk-secret',
        readConfig: () => ({}),
        writeConfig: () => {},
      }),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout())).toMatchObject({ schemaVersion: 1, command: 'auth', result });
    expect(all()).not.toContain('sk-secret');
  });

  it('reports a config write failure as a JSON error record', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(
      ['--json', 'auth', 'add', 'deepseek'],
      io,
      deps({
        prompt: async () => 'sk-secret',
        readConfig: () => ({}),
        writeConfig: () => {
          throw Object.assign(new Error('EACCES: permission denied, open config.json'), {
            code: 'EACCES',
          });
        },
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(stdout()).toBe('');
    const record = JSON.parse(stderr().trim().split('\n').at(-1) ?? '');
    expect(record).toMatchObject({ schemaVersion: 1, command: 'auth', kind: 'error' });
    expect(record.message).toContain('permission denied');
    expect(stderr()).not.toContain('sk-secret');
  });

  it('reports a remove write failure as a JSON error record', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['--json', 'auth', 'remove', 'deepseek'],
      io,
      deps({
        readConfig: () => ({}),
        writeConfig: () => {
          throw new Error('ENOSPC: no space left on device');
        },
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(JSON.parse(stderr().trim())).toMatchObject({ command: 'auth', kind: 'error' });
  });

  it('reports a rejected prompt as a JSON error record', async () => {
    const { io, stderr } = capture();
    const code = await run(
      ['--json', 'auth', 'add', 'deepseek'],
      io,
      deps({
        prompt: async () => {
          throw new Error('stdin closed');
        },
        readConfig: () => ({}),
        writeConfig: () => {},
      }),
    );
    expect(code).toBe(ExitCode.Error);
    expect(JSON.parse(stderr().trim())).toMatchObject({
      command: 'auth',
      kind: 'error',
      message: 'stdin closed',
    });
  });

  it('ends a pending prompt at the deadline with a cancelled record', async () => {
    let written = false;
    const { io, stderr } = capture();
    const code = await run(
      ['--json', '--timeout-ms', '20', 'auth', 'add', 'deepseek'],
      io,
      deps({
        prompt: (_q, o) =>
          new Promise((_resolve, reject) => {
            o?.signal?.addEventListener('abort', () => reject(o.signal?.reason), { once: true });
          }),
        readConfig: () => ({}),
        writeConfig: () => {
          written = true;
        },
      }),
    );
    expect(code).toBe(ExitCode.Cancelled);
    expect(written).toBe(false);
    expect(JSON.parse(stderr().trim())).toMatchObject({ command: 'auth', kind: 'cancelled' });
  });

  it('does not store a key answered after cancellation', async () => {
    const controller = new AbortController();
    let written = false;
    const { io } = capture();
    const code = await run(
      ['auth', 'add', 'deepseek'],
      io,
      deps({
        prompt: async () => {
          controller.abort(new CancelledError('cancelled'));
          return 'sk-late';
        },
        readConfig: () => ({}),
        writeConfig: () => {
          written = true;
        },
        signal: controller.signal,
      }),
    );
    expect(code).toBe(ExitCode.Cancelled);
    expect(written).toBe(false);
  });
});
