import { describe, expect, it } from 'vitest';
import {
  isFeedContentType,
  isHtmlContentType,
  isJsonContentType,
  mediaTypeOf,
} from '@owlieio/core';

describe('mediaTypeOf', () => {
  it('parses the media type before any parameters and lowercases it', () => {
    expect(mediaTypeOf('text/html')).toBe('text/html');
    expect(mediaTypeOf('Text/HTML; Charset=UTF-8')).toBe('text/html');
    expect(mediaTypeOf('application/json; charset=utf-8')).toBe('application/json');
    expect(mediaTypeOf('  application/xml  ')).toBe('application/xml');
  });

  it('returns undefined for a missing or empty declaration', () => {
    expect(mediaTypeOf(null)).toBeUndefined();
    expect(mediaTypeOf(undefined)).toBeUndefined();
    expect(mediaTypeOf('')).toBeUndefined();
    expect(mediaTypeOf('   ')).toBeUndefined();
    expect(mediaTypeOf('; charset=utf-8')).toBeUndefined();
  });
});

describe('isHtmlContentType', () => {
  it('accepts HTML and XHTML media types', () => {
    expect(isHtmlContentType('text/html')).toBe(true);
    expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlContentType('application/xhtml+xml')).toBe(true);
    expect(isHtmlContentType('Application/XHTML+XML')).toBe(true);
  });

  it('rejects non-HTML and missing declarations', () => {
    expect(isHtmlContentType('application/json')).toBe(false);
    expect(isHtmlContentType('text/plain')).toBe(false);
    expect(isHtmlContentType(null)).toBe(false);
    expect(isHtmlContentType(undefined)).toBe(false);
    expect(isHtmlContentType('')).toBe(false);
  });
});

describe('isJsonContentType', () => {
  it('accepts JSON media types including +json suffixes', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/ld+json')).toBe(true);
    expect(isJsonContentType('application/vnd.api+json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
  });

  it('rejects non-JSON and missing declarations', () => {
    expect(isJsonContentType('text/html')).toBe(false);
    expect(isJsonContentType('application/xml')).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
    expect(isJsonContentType('')).toBe(false);
  });
});

describe('isFeedContentType', () => {
  it('accepts RSS, Atom, XML, and +xml media types', () => {
    expect(isFeedContentType('application/rss+xml')).toBe(true);
    expect(isFeedContentType('application/atom+xml')).toBe(true);
    expect(isFeedContentType('application/xml')).toBe(true);
    expect(isFeedContentType('text/xml')).toBe(true);
    expect(isFeedContentType('application/rdf+xml; charset=utf-8')).toBe(true);
    expect(isFeedContentType('Application/RSS+XML')).toBe(true);
  });

  it('rejects non-feed and missing declarations', () => {
    expect(isFeedContentType('text/html')).toBe(false);
    expect(isFeedContentType('application/json')).toBe(false);
    expect(isFeedContentType('text/plain')).toBe(false);
    expect(isFeedContentType(null)).toBe(false);
    expect(isFeedContentType(undefined)).toBe(false);
    expect(isFeedContentType('')).toBe(false);
  });
});
