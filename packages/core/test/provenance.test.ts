import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_DOCUMENT_SCHEMA_VERSION,
  buildProvenance,
  contentFingerprint,
  fingerprintText,
} from '@owlieio/core';

describe('normalized document schema', () => {
  it('is version 2', () => {
    expect(NORMALIZED_DOCUMENT_SCHEMA_VERSION).toBe(2);
  });
});

describe('fingerprintText', () => {
  it('matches the known SHA-256 of identical text', () => {
    expect(fingerprintText('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('changes when the text changes', () => {
    expect(fingerprintText('hello world')).not.toBe(fingerprintText('hello world!'));
  });

  it('hashes UTF-8 bytes, not a lossy encoding', () => {
    expect(fingerprintText('héllo wörld')).toBe(
      'a1003f7d04a4115711d0b48a2eaf1359ce565d2d2a6fd65098dfcffadeeef59f',
    );
  });

  it('does not include source identity or mutable metadata', () => {
    // Two documents with different ids/urls but identical text share a digest.
    const text = 'same text';
    const a = buildProvenance({
      sourceId: 'youtube:video:1',
      canonicalUrl: 'https://example.com/1',
      adapterId: 'youtube',
      text,
      fetchedAt: '2026-09-21T00:00:00.000Z',
    });
    const b = buildProvenance({
      sourceId: 'youtube:video:2',
      canonicalUrl: 'https://example.com/2',
      adapterId: 'youtube',
      text,
      fetchedAt: '2026-09-21T00:00:01.000Z',
    });
    expect(a.contentFingerprint.digest).toBe(b.contentFingerprint.digest);
  });
});

describe('contentFingerprint', () => {
  it('labels the algorithm sha256', () => {
    expect(contentFingerprint('hello world')).toEqual({
      algorithm: 'sha256',
      digest: fingerprintText('hello world'),
    });
  });
});

describe('buildProvenance', () => {
  it('assembles required fields and computes the fingerprint', () => {
    const provenance = buildProvenance({
      sourceId: 'youtube:video:1',
      canonicalUrl: 'https://example.com/watch?v=1',
      adapterId: 'youtube',
      text: 'hello world',
      fetchedAt: '2026-09-21T00:00:00.000Z',
    });
    expect(provenance).toEqual({
      sourceId: 'youtube:video:1',
      canonicalUrl: 'https://example.com/watch?v=1',
      adapterId: 'youtube',
      fetchedAt: '2026-09-21T00:00:00.000Z',
      contentFingerprint: { algorithm: 'sha256', digest: fingerprintText('hello world') },
      warnings: [],
    });
  });

  it('carries optional resolverId, language, and warnings', () => {
    const provenance = buildProvenance({
      sourceId: 'podcast:episode:1',
      canonicalUrl: 'https://example.com/audio.mp3',
      adapterId: 'podcast',
      text: 'hello',
      fetchedAt: '2026-09-21T00:00:00.000Z',
      resolverId: 'podcast-apple',
      language: 'en',
      warnings: [{ code: 'ARTICLE_FALLBACK', message: 'extracting article text' }],
    });
    expect(provenance.resolverId).toBe('podcast-apple');
    expect(provenance.language).toBe('en');
    expect(provenance.warnings).toEqual([
      { code: 'ARTICLE_FALLBACK', message: 'extracting article text' },
    ]);
  });

  it('never embeds secret-bearing values in the digest (only text)', () => {
    const secret = 'Bearer sk-topsecret';
    const provenance = buildProvenance({
      sourceId: secret,
      canonicalUrl: 'https://user:pass@example.com/path?token=secret',
      adapterId: 'article',
      text: 'public text',
      fetchedAt: '2026-09-21T00:00:00.000Z',
    });
    expect(provenance.contentFingerprint.digest).toBe(fingerprintText('public text'));
  });
});
