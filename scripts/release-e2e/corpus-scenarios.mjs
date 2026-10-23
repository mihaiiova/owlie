// Release scenarios on the controlled corpus, for outcomes a real page cannot
// be relied on to keep: exact error codes, the recovery path, a local file,
// and direct media. Real-world coverage lives in the URL catalog
// (real-world.mjs). `assert` closures are pure.

import { jsonAssert, parseErrorRecord, parseJson } from './assertions.mjs';
import { appInvocation } from './real-world.mjs';

const RECOVERED_WARNING = 'article_text_recovered';
const fail = (error) => ({ ok: false, error });

function articleWithMarker(doc, marker) {
  if (doc?.sourceType !== 'article') return fail(`sourceType ${doc?.sourceType}, expected article`);
  if (typeof doc.text !== 'string' || !doc.text.includes(marker))
    return fail('article text missing marker');
  return { ok: true };
}

function pdfWithMarker(doc, { marker, pageCount, sourceType }) {
  if (doc?.sourceType !== sourceType)
    return fail(`sourceType ${doc?.sourceType}, expected ${sourceType}`);
  if (doc.metadata?.format !== 'pdf') return fail('metadata.format is not pdf');
  if (doc.metadata.pageCount !== pageCount || doc.metadata.pagesRead !== pageCount) {
    return fail(
      `read ${doc.metadata.pagesRead}/${doc.metadata.pageCount} pages, expected ${pageCount}`,
    );
  }
  if (typeof doc.text !== 'string' || !doc.text.includes(marker))
    return fail('PDF text missing marker');
  return { ok: true };
}

const warningCodes = (doc) => (doc?.provenance?.warnings ?? []).map((warning) => warning.code);

/**
 * `ctx.corpusPages` holds the corpus URLs and markers (see the manifest);
 * `ctx.localPdf` is the corpus PDF's path on disk.
 */
export function buildCorpusScenarios(ctx, spawn, spawnTty) {
  const { corpusPages: pages, localPdf, apiKey } = ctx;
  const app = (args) => spawn({ args: appInvocation(args), timeoutMs: 60_000 });

  return [
    {
      name: 'extract custom-element article',
      allowProxyFallback: false,
      run: () => app(['extract', pages.customElements.url, '--article']),
      assert: jsonAssert(parseJson, (doc) => {
        const marked = articleWithMarker(doc, pages.customElements.marker);
        if (!marked.ok) return marked;
        // Kept by the sanitizer itself, not recovered by the fallback reader.
        if (warningCodes(doc).includes(RECOVERED_WARNING))
          return fail('custom elements needed recovery');
        return { ok: true };
      }),
    },
    {
      name: 'classify declared article',
      allowProxyFallback: false,
      // The app's page classification: a declared article wins over its feed link.
      run: () => app(['extract', pages.customElements.url, '--limit', '1']),
      assert: jsonAssert(parseJson, (result) => {
        if (Array.isArray(result?.items)) return fail('declared article was read as its feed');
        return articleWithMarker(result, pages.customElements.marker);
      }),
    },
    {
      name: 'extract recovered article',
      allowProxyFallback: false,
      run: () => app(['extract', pages.recovered.url, '--article']),
      assert: jsonAssert(parseJson, (doc) => {
        const marked = articleWithMarker(doc, pages.recovered.marker);
        if (!marked.ok) return marked;
        if (!warningCodes(doc).includes(RECOVERED_WARNING))
          return fail(`missing ${RECOVERED_WARNING} warning`);
        return { ok: true };
      }),
    },
    {
      name: 'empty article error',
      allowProxyFallback: false,
      // The error record is this scenario's success outcome.
      expectedExitCode: 1,
      run: () => app(['extract', pages.shortArticle.url, '--article']),
      assert: (result) => {
        const errors = [];
        if (result.status !== 1)
          errors.push(`expected exit code 1, got ${result.status ?? '<none>'}`);
        if (String(result.stdout).trim() !== '') errors.push('wrote a result on stdout');
        const record = parseErrorRecord(result.stderr);
        if (!record) errors.push('missing error record on stderr');
        else {
          if (record.code !== pages.shortArticle.errorCode) {
            errors.push(`error code ${record.code}, expected ${pages.shortArticle.errorCode}`);
          }
          if (record.details?.declaredSignal !== 'og-article')
            errors.push('details.declaredSignal is not og-article');
          if (typeof record.details?.readableChars !== 'number')
            errors.push('details.readableChars missing');
        }
        return { ok: errors.length === 0, errors };
      },
    },
    {
      name: 'extract corpus pdf link',
      allowProxyFallback: false,
      run: () => app(['extract', pages.pdf.url]),
      assert: jsonAssert(parseJson, (doc) =>
        pdfWithMarker(doc, { ...pages.pdf, sourceType: 'article' }),
      ),
    },
    {
      name: 'extract local pdf',
      allowProxyFallback: false,
      run: () => spawn({ args: ['extract', localPdf, '--json'], env: {}, timeoutMs: 60_000 }),
      assert: jsonAssert(parseJson, (doc) =>
        pdfWithMarker(doc, { ...pages.pdf, sourceType: 'local' }),
      ),
    },
    {
      name: 'resolve direct media',
      allowProxyFallback: false,
      run: () => app(['resolve', pages.audio.url]),
      assert: jsonAssert(parseJson, (resolution) => {
        if (resolution?.resolver !== 'podcast-media')
          return fail(`resolver ${resolution?.resolver}`);
        if (resolution.mediaUrl !== pages.audio.url) return fail('mediaUrl is not the audio URL');
        return { ok: true };
      }),
    },
    {
      name: 'process pdf link',
      allowProxyFallback: false,
      run: () =>
        spawnTty({
          args: [
            'process',
            pages.pdf.url,
            '--prompt',
            'Reply with exactly: OK',
            '--json',
            '--quiet',
          ],
          env: {
            OWLIE_PROVIDER: 'deepseek',
            DEEPSEEK_API_KEY: apiKey,
            DEEPSEEK_MODEL: 'deepseek-chat',
          },
          timeoutMs: 120_000,
        }),
      assert: jsonAssert(parseJson, (result) => {
        if (result?.format !== 'text') return fail('wrong result format');
        return /OK/i.test(String(result.output)) ? { ok: true } : fail('output missing OK marker');
      }),
    },
  ];
}
