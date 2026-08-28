import { describe, expect, it } from 'vitest';

import {
  buildDiagnostics,
  buildScenarios,
  executeScenario,
  toFailure,
  youtubeVideoId,
} from './scenarios.mjs';

const ok = () => ({ ok: true, errors: [] });
const fail = () => ({ ok: false, errors: ['nope'] });

function scenario(overrides = {}) {
  return {
    name: 's',
    allowProxyFallback: false,
    run: () => ({ status: 0, stdout: '', stderr: '', signal: null, error: null }),
    assert: ok,
    ...overrides,
  };
}

describe('youtubeVideoId', () => {
  it('extracts the v parameter', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(youtubeVideoId('https://youtu.be/watch?v=abc&t=1')).toBe('abc');
  });

  it('returns undefined when absent', () => {
    expect(youtubeVideoId('https://example.com')).toBeUndefined();
  });
});

describe('toFailure', () => {
  it('maps spawn errors', () => {
    expect(toFailure({ error: { code: 'ENOENT', message: 'gone' } })).toEqual({
      kind: 'spawn',
      code: 'ENOENT',
      message: 'gone',
    });
  });

  it('maps signals to timeouts', () => {
    expect(toFailure({ signal: 'SIGTERM' })).toEqual({ kind: 'timeout', signal: 'SIGTERM' });
  });

  it('maps zero status with failed assertions to an assertion failure', () => {
    expect(toFailure({ status: 0 }, ['bad'])).toEqual({ kind: 'assertion', message: 'bad' });
  });

  it('maps non-zero status to an exit failure', () => {
    expect(toFailure({ status: 1, stderr: 'x' }, ['bad'])).toEqual({
      kind: 'exit',
      stderr: 'x',
      message: 'bad',
    });
  });
});

describe('buildDiagnostics', () => {
  it('includes assertion, exit, and stderr details', () => {
    const text = buildDiagnostics({ status: 1, stderr: 'boom' }, ['assertion one']);
    expect(text).toContain('assertion one');
    expect(text).toContain('exit 1');
    expect(text).toContain('boom');
  });
});

describe('executeScenario', () => {
  it('passes on the first successful attempt', async () => {
    const result = await executeScenario({ scenario: scenario(), ctx: {}, secrets: [] });
    expect(result).toMatchObject({ status: 'passed', attempts: 1 });
    expect(result.attemptDiagnostics).toEqual([]);
  });

  it('records sanitized diagnostics for every attempt', async () => {
    let calls = 0;
    const s = scenario({
      run: () => {
        calls += 1;
        return calls === 1
          ? { status: 1, stdout: '', stderr: 'connection reset by peer', signal: null, error: null }
          : { status: 1, stdout: '', stderr: '503 service unavailable', signal: null, error: null };
      },
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: [] });
    expect(result.status).toBe('failed');
    expect(result.attemptDiagnostics).toHaveLength(2);
    expect(result.attemptDiagnostics[0]).toMatchObject({ attempt: 1, classification: 'transient' });
    expect(result.attemptDiagnostics[1]).toMatchObject({ attempt: 2, classification: 'transient' });
    expect(result.attemptDiagnostics[0].diagnostics).toContain('connection reset');
    expect(result.attemptDiagnostics[1].diagnostics).toContain('503');
  });

  it('retries a transient failure once and then passes', async () => {
    let calls = 0;
    const s = scenario({
      run: () => {
        calls += 1;
        return calls === 1
          ? { status: 1, stdout: '', stderr: 'connection reset by peer', signal: null, error: null }
          : { status: 0, stdout: '', stderr: '', signal: null, error: null };
      },
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: [] });
    expect(result).toMatchObject({ status: 'passed', attempts: 2 });
  });

  it('stops after the attempt budget on persistent transient failures', async () => {
    const s = scenario({
      run: () => ({
        status: 1,
        stdout: '',
        stderr: '503 service unavailable',
        signal: null,
        error: null,
      }),
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: [] });
    expect(result).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('does not retry deterministic failures', async () => {
    let calls = 0;
    const s = scenario({
      run: () => {
        calls += 1;
        return { status: 2, stdout: '', stderr: 'invalid URL', signal: null, error: null };
      },
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: [] });
    expect(result).toMatchObject({ status: 'failed', attempts: 1 });
    expect(calls).toBe(1);
  });

  it('does not retry a failing assertion on a zero exit', async () => {
    let calls = 0;
    const s = scenario({
      run: () => {
        calls += 1;
        return { status: 0, stdout: '{}', stderr: '', signal: null, error: null };
      },
      assert: fail,
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: [] });
    expect(result).toMatchObject({ status: 'failed', attempts: 1 });
    expect(calls).toBe(1);
  });

  it('retries a YouTube access block through the proxy', async () => {
    const useProxyCalls = [];
    const s = scenario({
      allowProxyFallback: true,
      run: (useProxy) => {
        useProxyCalls.push(useProxy);
        if (useProxy) return { status: 0, stdout: '', stderr: '', signal: null, error: null };
        return {
          status: 1,
          stdout: '',
          stderr: 'YouTube blocked the transcript request (this network IP is likely blocked)',
          signal: null,
          error: null,
        };
      },
    });
    const result = await executeScenario({
      scenario: s,
      ctx: { proxyUrl: 'http://p:8080' },
      secrets: [],
    });
    expect(result).toMatchObject({ status: 'passed', attempts: 2 });
    expect(useProxyCalls).toEqual([false, true]);
  });

  it('does not retry an access block when no proxy is configured', async () => {
    const s = scenario({
      allowProxyFallback: true,
      run: () => ({
        status: 1,
        stdout: '',
        stderr: 'YouTube blocked the transcript request (this network IP is likely blocked)',
        signal: null,
        error: null,
      }),
    });
    const result = await executeScenario({ scenario: s, ctx: { proxyUrl: '' }, secrets: [] });
    expect(result).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('sanitizes secrets from failure diagnostics', async () => {
    const s = scenario({
      run: () => ({
        status: 1,
        stdout: '',
        stderr: 'leaked sk-live-12345',
        signal: null,
        error: null,
      }),
    });
    const result = await executeScenario({ scenario: s, ctx: {}, secrets: ['sk-live-12345'] });
    expect(result.status).toBe('failed');
    expect(result.diagnostics).not.toContain('sk-live-12345');
  });
});

describe('buildScenarios', () => {
  const ctx = {
    articleUrl: 'https://example.com/article.html',
    feedUrl: 'https://example.com/feed.xml',
    youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    apiKey: 'sk-test',
    proxyUrl: '',
    configHome: '/tmp/xdg',
    proxyConfigHome: '/tmp/xdg-proxy',
    inputFile: '/tmp/input.txt',
    corpus: { marker: 'MARKER', entryCount: 1 },
  };
  const spawn = () => ({ status: 0, stdout: '', stderr: '' });
  const spawnInteractive = async () => ({
    status: 0,
    stdout: 'owlie setup complete\n',
    stderr: '',
  });

  it('builds the full scenario inventory with run/assert pairs', () => {
    const scenarios = buildScenarios(ctx, spawn, spawnInteractive);
    expect(scenarios.map((s) => s.name)).toEqual([
      'help',
      'version',
      'doctor',
      'setup (proxy none)',
      'list',
      'extract article',
      'extract youtube',
      'extract feed',
      'process file',
      'extract → process pipeline',
      'process feed --each',
    ]);
    for (const s of scenarios) {
      expect(typeof s.run).toBe('function');
      expect(typeof s.assert).toBe('function');
    }
  });

  it('marks only the YouTube scenario as proxy-fallback eligible', () => {
    const scenarios = buildScenarios(ctx, spawn, spawnInteractive);
    const youtube = scenarios.find((s) => s.name === 'extract youtube');
    expect(youtube?.allowProxyFallback).toBe(true);
    const others = scenarios.filter((s) => s.name !== 'extract youtube');
    expect(others.every((s) => s.allowProxyFallback === false)).toBe(true);
  });
});
