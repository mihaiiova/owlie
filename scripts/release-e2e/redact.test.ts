import { describe, expect, it } from 'vitest';

import { redact, redactAuthorization, sanitize } from './redact.mjs';

describe('redact', () => {
  it('replaces exact secret values anywhere in the text', () => {
    expect(redact('value=abcdefghijklmnop here', ['abcdefghijklmnop'])).toBe(
      'value=[REDACTED] here',
    );
  });

  it('replaces every occurrence', () => {
    expect(redact('a sk-1 b sk-1', ['sk-1'])).toBe('a [REDACTED] b [REDACTED]');
  });

  it('ignores empty secrets', () => {
    expect(redact('unchanged', [''])).toBe('unchanged');
  });

  it('treats non-string input as text', () => {
    expect(redact(undefined, ['x'])).toBe('undefined');
  });
});

describe('redactAuthorization', () => {
  it('redacts authorization headers', () => {
    expect(redactAuthorization('Authorization: Bearer abc123')).toBe('Authorization: [REDACTED]');
  });

  it('redacts bearer tokens', () => {
    expect(redactAuthorization('curl -H "Authorization: Bearer deadbeef"')).toBe(
      'curl -H "Authorization: [REDACTED]"',
    );
  });

  it('redacts DEEPSEEK_API_KEY assignments', () => {
    expect(redactAuthorization('DEEPSEEK_API_KEY=sk-abc')).toBe('DEEPSEEK_API_KEY=[REDACTED]');
  });

  it('redacts standalone sk- tokens', () => {
    expect(redactAuthorization('the key sk-abcdefgh1234 leaked')).toBe('the key [REDACTED] leaked');
  });

  it('leaves unrelated text intact', () => {
    expect(redactAuthorization('extraction completed')).toBe('extraction completed');
  });
});

describe('sanitize', () => {
  it('applies exact-secret redaction and authorization redaction together', () => {
    const text = 'Authorization: Bearer tok DEEPSEEK_API_KEY=sk-x and proxy http://p:8080';
    expect(sanitize(text, { secrets: ['http://p:8080', 'sk-x'] })).toBe(
      'Authorization: [REDACTED] DEEPSEEK_API_KEY=[REDACTED] and proxy [REDACTED]',
    );
  });

  it('never leaves the configured secret value behind', () => {
    const secret = 'sk-live-super-secret';
    const output = sanitize(`echo ${secret}`, { secrets: [secret] });
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });
});
