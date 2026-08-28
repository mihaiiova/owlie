import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFeed } from '@owlieio/adapter-rss';
import { describe, expect, it } from 'vitest';

import { validateCorpus } from './corpus.mjs';

const corpusDir = fileURLToPath(new URL('../../e2e/corpus/', import.meta.url));
const read = (name) => readFileSync(`${corpusDir}${name}`, 'utf8');

const manifestJson = read('manifest.json');
const articleHtml = read('article.html');
const feedXml = read('feed.xml');
const manifest = JSON.parse(manifestJson);

describe('controlled corpus files', () => {
  it('passes structural and marker validation', () => {
    expect(validateCorpus({ manifestJson, articleHtml, feedXml })).toEqual({
      ok: true,
      errors: [],
      manifest: expect.any(Object),
    });
  });

  it('is a valid feed that parses to exactly one entry linking the article', async () => {
    const parsed = await parseFeed(feedXml);
    expect(parsed.format).toBe('rss');
    expect(parsed.entries).toHaveLength(manifest.feed.entryCount);
    expect(parsed.entries[0]?.url).toBe(`${manifest.baseUrl}/${manifest.article.path}`);
  });

  it('is a valid feed that detects RSS format from the byte content', async () => {
    const parsed = await parseFeed(feedXml);
    expect(parsed.title).toContain('Owlie E2E Corpus');
  });
});

describe('validateCorpus', () => {
  it('rejects invalid manifest JSON', () => {
    const result = validateCorpus({ manifestJson: '{oops', articleHtml, feedXml });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/not valid JSON/i);
  });

  it('rejects a missing marker', () => {
    const result = validateCorpus({ manifestJson, articleHtml: 'no marker here', feedXml });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/marker/i);
  });

  it('rejects an unexpected entry count', () => {
    const wrong = JSON.stringify({ ...manifest, feed: { path: 'feed.xml', entryCount: 5 } });
    const result = validateCorpus({ manifestJson: wrong, articleHtml, feedXml });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/found 1/i);
  });

  it('rejects a feed that does not link the article', () => {
    const result = validateCorpus({
      manifestJson,
      articleHtml,
      feedXml: feedXml.replace(/article\.html/g, 'other.html'),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/article path/i);
  });
});
