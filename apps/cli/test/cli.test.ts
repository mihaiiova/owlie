import { describe, expect, it } from 'vitest';
import { ExitCode, parseArgs, run, VERSION } from 'owlie';
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
    toolAvailable: async () => true,
  },
};

describe('--help', () => {
  it('lists only functional commands and exits 0', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['--help'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('extract');
    expect(stdout()).toContain('resolve');
    expect(stdout()).toContain('list');
    expect(stdout()).toContain('process');
    expect(stdout()).toContain('setup');
    expect(stdout()).toContain('doctor');
    expect(stdout()).toContain('--env-file PATH');
    expect(stdout()).not.toContain('(reserved)');
    expect(stdout()).not.toContain('search');
    expect(stdout()).not.toContain('config');
    expect(stderr()).toBe('');
  });
});

describe('direct-media limit flags', () => {
  it('parses timeout and byte limits as command options', () => {
    expect(
      parseArgs([
        'extract',
        'https://cdn.example.com/episode.mp3',
        '--timeout-ms=5000',
        '--max-media-bytes',
        '1024',
      ]).options,
    ).toMatchObject({ timeoutMs: '5000', maxMediaBytes: '1024' });
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
    expect(stdout()).toContain('Adapters: youtube, podcast, rss, article');
    expect(stdout()).toContain('Providers: deepseek, openai');
    expect(stdout()).toContain('deepseek: api key set (environment), model set');
    expect(stdout()).toContain('openai: api key not set, model not set');
    expect(stdout()).toContain('Transcription: whisper detected');
    expect(stdout()).not.toContain('Deferred');
  });

  it('supports --json on stdout', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['doctor', '--json'], io, fakeDeps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout());
    expect(report.node).toContain('v');
    expect(report.adapters).toEqual(['youtube', 'podcast', 'rss', 'article']);
    expect(report.providers).toEqual([
      { id: 'deepseek', apiKey: 'set', model: 'set', authSource: 'environment' },
      { id: 'openai', apiKey: 'not set', model: 'not set', authSource: 'not set' },
    ]);
    expect(report.transcription).toEqual({
      whisper: 'detected',
      ffmpeg: 'detected',
      ffprobe: 'detected',
      model: 'not set',
    });
    expect(report.deepSeekApiKey).toBeUndefined();
    expect(report.modelConfigured).toBeUndefined();
    expect(stderr()).toBe('');
  });

  it('probes ffmpeg/ffprobe with -version and python3 with --version', async () => {
    const calls: Array<{ tool: string; args?: readonly string[] }> = [];
    const { io } = capture();
    const deps: CliDeps = {
      doctor: {
        dirWritable: async () => true,
        env: {},
        toolAvailable: async (tool, args) => {
          calls.push({ tool, args });
          return true;
        },
      },
    };
    const code = await run(['doctor', '--json'], io, deps);
    expect(code).toBe(ExitCode.Success);
    expect(calls.find((c) => c.tool === 'ffmpeg')?.args).toEqual(['-version']);
    expect(calls.find((c) => c.tool === 'ffprobe')?.args).toEqual(['-version']);
    const pythonCalls = calls.filter((c) => c.tool === 'python3');
    expect(pythonCalls.some((c) => c.args === undefined)).toBe(true);
    expect(
      pythonCalls.some(
        (c) => c.args && c.args[0] === '-c' && c.args[1] === 'import faster_whisper',
      ),
    ).toBe(true);
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
