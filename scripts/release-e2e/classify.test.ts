import { describe, expect, it } from 'vitest';

import { classifyFailure, isYoutubeAccessBlock, MAX_ATTEMPTS, shouldRetry } from './classify.mjs';

describe('classifyFailure', () => {
  it('classifies timeouts as transient', () => {
    expect(classifyFailure({ kind: 'timeout' })).toBe('transient');
  });

  it('classifies network spawn failures as transient', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
      expect(classifyFailure({ kind: 'spawn', code })).toBe('transient');
    }
  });

  it('classifies non-network spawn failures as deterministic', () => {
    expect(classifyFailure({ kind: 'spawn', code: 'ENOENT' })).toBe('deterministic');
    expect(classifyFailure({ kind: 'spawn', code: 'EACCES' })).toBe('deterministic');
  });

  it('classifies upstream 5xx and rate-limit exits as transient', () => {
    expect(classifyFailure({ kind: 'exit', stderr: 'HTTP 503 service unavailable' })).toBe(
      'transient',
    );
    expect(classifyFailure({ kind: 'exit', stderr: '429 too many requests' })).toBe('transient');
    expect(classifyFailure({ kind: 'exit', stderr: 'connection reset by peer' })).toBe('transient');
  });

  it('classifies usage and auth failures as deterministic', () => {
    expect(classifyFailure({ kind: 'exit', stderr: 'invalid URL' })).toBe('deterministic');
    expect(classifyFailure({ kind: 'exit', stderr: 'DEEPSEEK_API_KEY is not set' })).toBe(
      'deterministic',
    );
    expect(classifyFailure({ kind: 'exit', stderr: 'HTTP 401 unauthorized' })).toBe(
      'deterministic',
    );
  });

  it('classifies empty or unexpected exits as deterministic', () => {
    expect(classifyFailure({ kind: 'exit', stderr: '' })).toBe('deterministic');
    expect(classifyFailure({ kind: 'exit', stderr: 'something odd happened' })).toBe(
      'deterministic',
    );
  });

  it('classifies assertion failures as deterministic', () => {
    expect(classifyFailure({ kind: 'assertion', message: 'missing marker' })).toBe('deterministic');
  });

  it('classifies a YouTube access block as its own retryable class', () => {
    expect(
      classifyFailure({
        kind: 'exit',
        stderr: 'YouTube blocked the transcript request (this network IP is likely blocked)',
      }),
    ).toBe('youtube-access-block');
  });
});

describe('isYoutubeAccessBlock', () => {
  it('matches the transcript access-block diagnostic', () => {
    expect(
      isYoutubeAccessBlock(
        'YouTube blocked the transcript request (this network IP is likely blocked). Configure a proxy by running `owlie setup`.',
      ),
    ).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(isYoutubeAccessBlock('failed to fetch YouTube transcript: fetch failed')).toBe(false);
  });
});

describe('shouldRetry', () => {
  it('retries a transient failure once with the same configuration', () => {
    expect(
      shouldRetry({ attempt: 1, classification: 'transient', proxyConfigured: false }),
    ).toEqual({ retry: true, useProxy: false });
  });

  it('never retries beyond the attempt budget', () => {
    expect(
      shouldRetry({ attempt: MAX_ATTEMPTS, classification: 'transient', proxyConfigured: false }),
    ).toEqual({ retry: false, useProxy: false });
  });

  it('uses the proxy fallback for a YouTube access block', () => {
    expect(
      shouldRetry({
        attempt: 1,
        classification: 'youtube-access-block',
        proxyConfigured: true,
        allowProxyFallback: true,
      }),
    ).toEqual({ retry: true, useProxy: true });
  });

  it('does not retry an access block without a configured proxy', () => {
    expect(
      shouldRetry({
        attempt: 1,
        classification: 'youtube-access-block',
        proxyConfigured: false,
        allowProxyFallback: true,
      }),
    ).toEqual({ retry: false, useProxy: false });
  });

  it('does not retry an access block when fallback is disallowed', () => {
    expect(
      shouldRetry({
        attempt: 1,
        classification: 'youtube-access-block',
        proxyConfigured: true,
        allowProxyFallback: false,
      }),
    ).toEqual({ retry: false, useProxy: false });
  });

  it('does not retry deterministic failures', () => {
    expect(
      shouldRetry({ attempt: 1, classification: 'deterministic', proxyConfigured: true }),
    ).toEqual({ retry: false, useProxy: false });
  });
});
