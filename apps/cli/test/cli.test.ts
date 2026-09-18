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
      isTTY: false,
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
    loadFile: () => ({}),
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

  it('documents the auth and models commands and hides the deprecated --provider flag', async () => {
    const { io, stdout } = capture();
    const code = await run(['--help'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('auth');
    expect(stdout()).toContain('models');
    expect(stdout()).toContain('--model');
    expect(stdout()).not.toContain('--provider');
  });

  it('documents the compound --model reference for process', async () => {
    const { io, stdout } = capture();
    const code = await run(['process', '--help'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('--model provider/model-id');
    expect(stdout()).not.toContain('--provider');
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
    expect(stdout()).toContain('deepseek: api key set (environment), model deepseek-chat');
    expect(stdout()).toContain('openai: api key not set, model not set');
    expect(stdout()).toContain('Transcription: whisper detected');
    expect(stdout()).not.toContain('Deferred');
  });

  it('supports --json on stdout', async () => {
    const { io, stdout, stderr } = capture();
    const code = await run(['doctor', '--json'], io, fakeDeps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout()).result;
    expect(report.node).toContain('v');
    expect(report.adapters).toEqual(['youtube', 'podcast', 'rss', 'article']);
    expect(report.providers).toEqual([
      { id: 'deepseek', apiKey: 'set', model: 'deepseek-chat', authSource: 'environment' },
      { id: 'openai', apiKey: 'not set', model: null, authSource: 'not set' },
    ]);
    expect(report.transcription).toEqual({
      whisper: 'detected',
      ffmpeg: 'detected',
      ffprobe: 'detected',
      model: 'not set',
    });
    expect(report.configurationSource).toBe('local');
    expect(report.deepSeekApiKey).toBeUndefined();
    expect(report.modelConfigured).toBeUndefined();
    expect(stderr()).toBe('');
  });

  it('reports hosted config source without reading files or saved config', async () => {
    const { io, stdout } = capture();
    const deps: CliDeps = {
      doctor: {
        dirWritable: async () => true,
        env: { DEEPSEEK_API_KEY: 'sk-env', DEEPSEEK_MODEL: 'deepseek-chat' },
        loadFile: () => {
          throw new Error('loadFile called');
        },
        readConfig: () => {
          throw new Error('readConfig called');
        },
        toolAvailable: async () => true,
      },
    };
    const code = await run(['--hosted', 'doctor', '--json'], io, deps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout()).result;
    expect(report.configurationSource).toBe('hosted');
    expect(report.providers).toEqual([
      { id: 'deepseek', apiKey: 'set', model: 'deepseek-chat', authSource: 'environment' },
      { id: 'openai', apiKey: 'not set', model: null, authSource: 'not set' },
    ]);
    expect(report.transcription.model).toBe('not set');
  });

  it('resolves provider key and model from .env files like process does', async () => {
    const { io, stdout } = capture();
    const deps: CliDeps = {
      doctor: {
        dirWritable: async () => true,
        env: {},
        loadFile: (path: string): Record<string, string> =>
          path === '.env' ? { DEEPSEEK_API_KEY: 'sk-env', DEEPSEEK_MODEL: 'deepseek-chat' } : {},
        toolAvailable: async () => true,
      },
    };
    const code = await run(['doctor', '--json'], io, deps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout()).result;
    expect(report.providers).toEqual([
      { id: 'deepseek', apiKey: 'set', model: 'deepseek-chat', authSource: 'environment' },
      { id: 'openai', apiKey: 'not set', model: null, authSource: 'not set' },
    ]);
  });

  it('resolves provider config from an explicit --env-file', async () => {
    const { io, stdout } = capture();
    const deps: CliDeps = {
      doctor: {
        dirWritable: async () => true,
        env: {},
        loadFile: (path: string): Record<string, string> =>
          path === 'custom.env'
            ? { DEEPSEEK_API_KEY: 'sk-file', DEEPSEEK_MODEL: 'deepseek-chat' }
            : {},
        toolAvailable: async () => true,
      },
    };
    const code = await run(['doctor', '--json', '--env-file', 'custom.env'], io, deps);
    expect(code).toBe(ExitCode.Success);
    const report = JSON.parse(stdout()).result;
    expect(report.providers[0]).toEqual({
      id: 'deepseek',
      apiKey: 'set',
      model: 'deepseek-chat',
      authSource: 'environment',
    });
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

describe('--hosted', () => {
  it('parses as a global flag before or after the command', () => {
    expect(parseArgs(['--hosted', 'process']).options.hosted).toBe(true);
    expect(parseArgs(['process', '--hosted']).options.hosted).toBe(true);
    expect(parseArgs(['process']).options.hosted).toBe(false);
  });

  it('documents the flag in --help', async () => {
    const { io, stdout } = capture();
    const code = await run(['--help'], io);
    expect(code).toBe(ExitCode.Success);
    expect(stdout()).toContain('--hosted');
  });

  it('rejects auth without prompting or writing state', async () => {
    let prompted = false;
    let written: unknown;
    const { io, stderr } = capture();
    const code = await run(['--hosted', 'auth', 'add', 'deepseek'], io, {
      auth: {
        prompt: async () => {
          prompted = true;
          return 'sk-x';
        },
        readConfig: () => ({}),
        writeConfig: (config) => (written = config),
      },
    });
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('auth');
    expect(stderr()).toContain('hosted');
    expect(prompted).toBe(false);
    expect(written).toBeUndefined();
  });

  it('rejects setup without prompting or writing state', async () => {
    let prompted = false;
    let written: unknown;
    const { io, stderr } = capture();
    const code = await run(['--hosted', 'setup'], io, {
      setup: {
        prompt: async () => {
          prompted = true;
          return 'sk-x';
        },
        readConfig: () => ({}),
        writeConfig: (config) => (written = config),
      },
    });
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('setup');
    expect(stderr()).toContain('hosted');
    expect(prompted).toBe(false);
    expect(written).toBeUndefined();
  });

  it('rejects --env-file as a usage error', async () => {
    const { io, stderr } = capture();
    const code = await run(['--hosted', '--env-file', 'custom.env', 'doctor'], io);
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('--env-file');
    expect(stderr()).toContain('--hosted');
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
