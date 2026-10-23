import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArticleAdapter, extractPdfText } from '@owlieio/adapter-article';
import { parseFeed } from '@owlieio/adapter-rss';
import { describe, expect, it } from 'vitest';

import { corpusPaths, validateCorpus } from './corpus.mjs';

const corpusDir = fileURLToPath(new URL('../../e2e/corpus/', import.meta.url));
const read = (name) => readFileSync(`${corpusDir}${name}`, 'utf8');

const manifestJson = read('manifest.json');
const articleHtml = read('article.html');
const feedXml = read('feed.xml');
const manifest = JSON.parse(manifestJson);
const files = Object.fromEntries(
  corpusPaths(manifest).map((path) => [path, readFileSync(`${corpusDir}${path}`, 'latin1')]),
);

/** Reads a corpus page through the article adapter, as `extract URL --article` does. */
async function extractPage(path) {
  const text = read(path);
  const adapter = new ArticleAdapter({
    fetcher: { fetch: async (url) => ({ url, contentType: 'text/html; charset=utf-8', text }) },
  });
  const item = await adapter.resolveItem({ url: `${manifest.baseUrl}/${path}` });
  return adapter.extract(item);
}

describe('controlled corpus files', () => {
  it('passes structural and marker validation', () => {
    expect(validateCorpus({ manifestJson, articleHtml, feedXml, files })).toEqual({
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

describe('controlled corpus pages', () => {
  it('keeps text inside custom elements without needing recovery', async () => {
    const doc = await extractPage(manifest.customElementArticle.path);
    expect(doc.text).toContain(manifest.customElementArticle.marker);
    expect(doc.provenance.warnings).toEqual([]);
  });

  it('recovers the body the sanitizer drops, with a warning', async () => {
    const doc = await extractPage(manifest.recoveredArticle.path);
    expect(doc.text).toContain(manifest.recoveredArticle.marker);
    expect(doc.provenance.warnings.map((warning) => warning.code)).toContain(
      'article_text_recovered',
    );
  });

  it('fails the short article with the manifest error code and details', async () => {
    await expect(extractPage(manifest.shortArticle.path)).rejects.toMatchObject({
      code: manifest.shortArticle.errorCode,
      details: { declaredSignal: 'og-article' },
    });
  });

  it('has a PDF with the manifest marker on its declared pages', async () => {
    const bytes = new Uint8Array(readFileSync(`${corpusDir}${manifest.pdf.path}`));
    const pdf = await extractPdfText(bytes);
    expect(pdf.pageCount).toBe(manifest.pdf.pageCount);
    expect(pdf.text).toContain(manifest.pdf.marker);
  });
});

describe('validateCorpus', () => {
  it('rejects a missing corpus file and a file without its marker', () => {
    const missing = validateCorpus({
      manifestJson,
      articleHtml,
      feedXml,
      files: { ...files, [manifest.pdf.path]: '' },
    });
    expect(missing.errors.join('\n')).toMatch(/sample\.pdf is missing/);
    const unmarked = validateCorpus({
      manifestJson,
      articleHtml,
      feedXml,
      files: { ...files, [manifest.recoveredArticle.path]: '<p>no marker</p>' },
    });
    expect(unmarked.errors.join('\n')).toMatch(/recovered\.html does not contain/);
  });

  it('rejects invalid manifest JSON', () => {
    const result = validateCorpus({ manifestJson: '{oops', articleHtml, feedXml, files });
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
