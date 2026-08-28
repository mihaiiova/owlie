import { describe, expect, it } from 'vitest';

import {
  assertContains,
  assertExitCode,
  assertMatch,
  assertNoSecrets,
  parseJson,
  parseJsonLines,
} from './assertions.mjs';

describe('parseJson', () => {
  it('parses a valid JSON document', () => {
    const result = parseJson('{"id":"x"}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ id: 'x' });
  });

  it('rejects invalid JSON', () => {
    const result = parseJson('{not json}');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid JSON/i);
  });

  it('rejects empty input', () => {
    expect(parseJson('').ok).toBe(false);
  });
});

describe('parseJsonLines', () => {
  it('parses a stream of JSON records', () => {
    const result = parseJsonLines('{"a":1}\n{"a":2}\n');
    expect(result.ok).toBe(true);
    expect(result.records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('ignores a trailing newline and blank lines', () => {
    expect(parseJsonLines('{"a":1}\n\n').ok).toBe(true);
    expect(parseJsonLines('{"a":1}\n\n').records).toEqual([{ a: 1 }]);
  });

  it('reports the failing line for invalid JSON', () => {
    const result = parseJsonLines('{"a":1}\nnot-json\n');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/line 2/i);
  });

  it('accepts empty input as an empty record list', () => {
    const result = parseJsonLines('');
    expect(result.ok).toBe(true);
    expect(result.records).toEqual([]);
  });
});

describe('assertExitCode', () => {
  it('passes when the status matches', () => {
    expect(assertExitCode({ status: 0 }, 0).ok).toBe(true);
  });

  it('fails when the status differs', () => {
    const result = assertExitCode({ status: 1 }, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exit code/i);
  });
});

describe('assertContains', () => {
  it('passes when the substring is present', () => {
    expect(assertContains('hello world', 'world').ok).toBe(true);
  });

  it('fails otherwise', () => {
    expect(assertContains('hello', 'world').ok).toBe(false);
  });
});

describe('assertMatch', () => {
  it('accepts string and regexp patterns', () => {
    expect(assertMatch('owlie 0.1.0', /^owlie \d+\.\d+\.\d+$/).ok).toBe(true);
    expect(assertMatch('owlie', 'owl').ok).toBe(true);
  });

  it('fails when the pattern does not match', () => {
    expect(assertMatch('nope', /^owlie/).ok).toBe(false);
  });
});

describe('assertNoSecrets', () => {
  it('passes when no configured secret is present', () => {
    expect(assertNoSecrets('clean output', ['sk-1', 'proxy']).ok).toBe(true);
  });

  it('fails when a secret is present', () => {
    const result = assertNoSecrets('leaked sk-live-123', ['sk-live-123']);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/secret/i);
  });

  it('ignores empty secrets', () => {
    expect(assertNoSecrets('clean', ['']).ok).toBe(true);
  });
});
