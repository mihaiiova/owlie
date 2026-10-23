import { describe, expect, it } from 'vitest';

import { buildCorpusScenarios } from './corpus-scenarios.mjs';
import { executeScenario } from './scenarios.mjs';

const ctx = {
  apiKey: 'sk-test',
  corpusPages: {
    customElements: { url: 'https://example.com/custom-elements.html', marker: 'CUSTOM' },
    recovered: { url: 'https://example.com/recovered.html', marker: 'RECOVERED' },
    shortArticle: { url: 'https://example.com/short-article.html', errorCode: 'ARTICLE_TOO_SHORT' },
    pdf: { url: 'https://example.com/sample.pdf', marker: 'PDF', pageCount: 2 },
    audio: { url: 'https://example.com/audio.wav' },
  },
  localPdf: '/corpus/sample.pdf',
};

const envelope = (command, result) => ({
  status: 0,
  stdout: JSON.stringify({ schemaVersion: 1, command, result }),
  stderr: '',
});
const article = (text, warnings = []) => ({
  sourceType: 'article',
  text,
  provenance: { adapterId: 'article', warnings },
});
const pdf = (sourceType, overrides = {}) => ({
  sourceType,
  text: 'Owlie PDF marker page two',
  metadata: { format: 'pdf', pageCount: 2, pagesRead: 2, ...overrides },
});

function scenarioNamed(name, spawn = () => ({ status: 0, stdout: '', stderr: '' })) {
  const tty = async () => ({ status: 0, stdout: '', stderr: '' });
  const scenario = buildCorpusScenarios(ctx, spawn, tty).find((s) => s.name === name);
  if (!scenario) throw new Error(`no scenario ${name}`);
  return scenario;
}

describe('buildCorpusScenarios', () => {
  it('runs app-path scenarios the way the app does', async () => {
    const calls = [];
    const spawn = (opts) => {
      calls.push(opts.args);
      return { status: 0, stdout: '', stderr: '' };
    };
    await scenarioNamed('extract custom-element article', spawn).run();
    await scenarioNamed('classify declared article', spawn).run();
    expect(calls[0].slice(0, 4)).toEqual([
      '--hosted',
      'extract',
      ctx.corpusPages.customElements.url,
      '--article',
    ]);
    expect(calls[1]).toContain('--limit');
    expect(calls[1]).not.toContain('--article');
    for (const args of calls)
      expect(args).toEqual(
        expect.arrayContaining(['--json', '--timeout-ms', '--max-stdout-bytes']),
      );
  });

  it('requires custom-element text without the recovery warning', () => {
    const { assert } = scenarioNamed('extract custom-element article');
    expect(assert(envelope('extract', article('has CUSTOM text'))).ok).toBe(true);
    expect(assert(envelope('extract', article('nothing'))).ok).toBe(false);
    expect(
      assert(envelope('extract', article('has CUSTOM text', [{ code: 'article_text_recovered' }])))
        .ok,
    ).toBe(false);
  });

  it('requires a declared article to classify as an article, not its feed', () => {
    const { assert } = scenarioNamed('classify declared article');
    expect(assert(envelope('extract', article('CUSTOM'))).ok).toBe(true);
    expect(
      assert(envelope('extract', { collection: { canonicalUrl: 'x' }, items: [] })).errors,
    ).toEqual(['declared article was read as its feed']);
  });

  it('requires the recovery warning on the recovered article', () => {
    const { assert } = scenarioNamed('extract recovered article');
    expect(
      assert(envelope('extract', article('RECOVERED', [{ code: 'article_text_recovered' }]))).ok,
    ).toBe(true);
    expect(assert(envelope('extract', article('RECOVERED'))).ok).toBe(false);
  });

  it('passes the empty-article scenario on exit 1 with the specific code and details', async () => {
    const stderr = `${JSON.stringify({
      schemaVersion: 1,
      command: 'extract',
      kind: 'error',
      code: 'ARTICLE_TOO_SHORT',
      message: 'no readable static article content at https://example.com/short-article.html',
      details: {
        declaredSignal: 'og-article',
        htmlBytes: 371,
        readableChars: 52,
        sanitizedChars: 52,
        customElementCount: 0,
      },
    })}\n`;
    const scenario = scenarioNamed('empty article error', () => ({
      status: 1,
      stdout: '',
      stderr,
    }));
    expect((await executeScenario({ scenario, ctx })).status).toBe('passed');

    const { assert } = scenario;
    expect(
      assert({
        status: 1,
        stdout: '',
        stderr: stderr.replace('ARTICLE_TOO_SHORT', 'EXTRACTION_ERROR'),
      }).ok,
    ).toBe(false);
    expect(
      assert({ status: 1, stdout: '', stderr: stderr.replace('"details"', '"other"') }).ok,
    ).toBe(false);
    expect(assert(envelope('extract', article('x'))).ok).toBe(false);
  });

  it('checks the PDF from a link and from a file', () => {
    const link = scenarioNamed('extract corpus pdf link').assert;
    const file = scenarioNamed('extract local pdf').assert;
    expect(link(envelope('extract', pdf('article'))).ok).toBe(true);
    expect(file(envelope('extract', pdf('local'))).ok).toBe(true);
    expect(link(envelope('extract', pdf('local'))).ok).toBe(false);
    expect(link(envelope('extract', pdf('article', { pagesRead: 1 }))).ok).toBe(false);
    expect(link(envelope('extract', pdf('article', { format: 'html' }))).ok).toBe(false);
  });

  it('resolves direct media to itself', () => {
    const { assert } = scenarioNamed('resolve direct media');
    const media = { resolver: 'podcast-media', mediaUrl: ctx.corpusPages.audio.url };
    expect(assert(envelope('resolve', media)).ok).toBe(true);
    expect(assert(envelope('resolve', { ...media, resolver: 'podcast-page' })).ok).toBe(false);
  });
});
