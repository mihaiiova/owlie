import { describe, expect, it } from 'vitest';

import { buildCandidateManifest, buildReport, buildSummary } from './report.mjs';

const candidate = {
  packageName: 'owlie',
  version: '0.1.0',
  commitSha: 'abc1234',
  tarball: 'owlie-0.1.0.tgz',
};

describe('buildCandidateManifest', () => {
  it('builds a manifest when every field is present', () => {
    const result = buildCandidateManifest({ ...candidate, sha256: 'deadbeef' });
    expect(result.ok).toBe(true);
    expect(result.manifest).toEqual({ ...candidate, sha256: 'deadbeef' });
  });

  it('reports each missing required field', () => {
    const result = buildCandidateManifest({ packageName: 'owlie' });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/version/i);
    expect(result.errors.join('\n')).toMatch(/commitSha/i);
  });

  it('returns no manifest on failure', () => {
    expect(buildCandidateManifest({}).manifest).toBeNull();
  });
});

describe('buildReport', () => {
  it('computes a passing summary and preserves scenario details', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        { name: 'list', status: 'passed', attempts: 1, durationMs: 100, diagnostics: '' },
        { name: 'extract', status: 'failed', attempts: 2, durationMs: 200, diagnostics: 'boom' },
        { name: 'process', status: 'skipped', attempts: 0, durationMs: 0, diagnostics: '' },
      ],
      secrets: [],
    });
    expect(report.summary).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1 });
    expect(report.scenarios[1]).toEqual({
      name: 'extract',
      status: 'failed',
      attempts: 2,
      durationMs: 200,
      diagnostics: 'boom',
      attemptDiagnostics: [],
    });
  });

  it('sanitizes diagnostics against configured secrets', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        {
          name: 'process',
          status: 'failed',
          attempts: 1,
          durationMs: 1,
          diagnostics: 'key sk-live-123',
        },
      ],
      secrets: ['sk-live-123'],
    });
    expect(report.scenarios[0].diagnostics).not.toContain('sk-live-123');
    expect(report.scenarios[0].diagnostics).toContain('[REDACTED]');
  });

  it('sanitizes per-attempt diagnostics', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        {
          name: 'extract youtube',
          status: 'failed',
          attempts: 2,
          durationMs: 1,
          diagnostics: 'proxy http://p:8080 failed',
          attemptDiagnostics: [
            { attempt: 1, classification: 'youtube-access-block', diagnostics: 'blocked' },
            {
              attempt: 2,
              classification: 'deterministic',
              diagnostics: 'proxy http://p:8080 failed',
            },
          ],
        },
      ],
      secrets: ['http://p:8080'],
    });
    expect(report.scenarios[0].attemptDiagnostics[1].diagnostics).not.toContain('http://p:8080');
    expect(report.scenarios[0].attemptDiagnostics[1].diagnostics).toContain('[REDACTED]');
  });
});

describe('buildSummary', () => {
  it('names the candidate and the failed scenarios', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        { name: 'list', status: 'passed', attempts: 1, durationMs: 1, diagnostics: '' },
        { name: 'extract', status: 'failed', attempts: 2, durationMs: 1, diagnostics: '' },
      ],
      secrets: [],
    });
    const summary = buildSummary(report);
    expect(summary).toContain('owlie 0.1.0');
    expect(summary).toContain('abc1234');
    expect(summary).toContain('extract');
    expect(summary).toContain('1/2');
  });

  it('never contains configured secrets', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        {
          name: 'x',
          status: 'failed',
          attempts: 1,
          durationMs: 1,
          diagnostics: 'leak sk-live-999',
        },
      ],
      secrets: ['sk-live-999'],
    });
    expect(buildSummary(report)).not.toContain('sk-live-999');
  });

  it('lists every attempt of a retried failure', () => {
    const report = buildReport({
      candidate,
      scenarios: [
        {
          name: 'extract youtube',
          status: 'failed',
          attempts: 2,
          durationMs: 1,
          diagnostics: 'deterministic: second failed',
          attemptDiagnostics: [
            { attempt: 1, classification: 'youtube-access-block', diagnostics: 'blocked direct' },
            { attempt: 2, classification: 'deterministic', diagnostics: 'proxy failed' },
          ],
        },
      ],
      secrets: [],
    });
    const summary = buildSummary(report);
    expect(summary).toContain('attempt 1 [youtube-access-block]: blocked direct');
    expect(summary).toContain('attempt 2 [deterministic]: proxy failed');
  });
});
