import { describe, expect, it } from 'vitest';
import { ExitCode, run, VERSION } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: {
      write: (chunk: string) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk: string) => {
        stderr += chunk;
      },
    },
    stdin: {
      isTTY: false,
      read: async () => '',
    },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

const fakeDeps: CliDeps = {
  doctor: {
    dirWritable: async () => true,
    env: { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-chat' },
  },
};

describe('--help', () => {
  it('lists only functional commands and exits 0', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['--help'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('extract');
    expect(stdout()).toContain('list');
    expect(stdout()).toContain('process');
    expect(stdout()).toContain('setup');
    expect(stdout()).toContain('doctor');
    expect(stdout()).not.toContain('search');
    expect(stdout()).not.toContain('config');
    expect(stderr()).toBe('');
  });
});

describe('--version', () => {
  it('prints the version and exits 0', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['--version'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toMatch(/^owlie \d+\.\d+\.\d+\n$/);
    expect(stdout()).toContain(VERSION);
    expect(stderr()).toBe('');
  });
});

describe('doctor', () => {
  it('reports environment health to stdout', async () => {
    const { io, stdout } = capture();
    const code = await run(['doctor'], io, fakeDeps);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('Node');
    expect(stdout()).toContain('DEEPSEEK_API_KEY: set');
    expect(stdout()).toContain('Model: set');
    expect(stdout()).toContain('Adapters: youtube, rss');
    expect(stdout()).toContain('Providers: deepseek');
    expect(stdout()).not.toContain('Deferred');
  });

  it('supports --json on stdout', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['doctor', '--json'], io, fakeDeps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout());
    expect(report.node).toContain('v');
    expect(report.deepSeekApiKey).toBe('set');
    expect(report.modelConfigured).toBe('set');
    expect(report.adapters).toEqual(['youtube', 'rss']);
    expect(report.providers).toEqual(['deepseek']);
    expect(report.deferredProviders).toBeUndefined();
    expect(stderr()).toBe('');
  });
});

describe('unknown commands', () => {
  it('returns a usage error', async () => {
    const { io, stderr } = capture();
    const code = await run(['frobnicate'], io);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('unknown command');
  });

  it('treats deferred commands as unknown', async () => {
    for (const command of ['search', 'config']) {
      const { io, stderr } = capture();
      const code = await run([command], io);
      expect(code).toBe(ExitCode.Usage);
      expect(stderr()).toContain('unknown command');
    }
  });
});
