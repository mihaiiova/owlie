import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentProcessor, HttpFetcher, ProcessRequest } from '@owlieio/core';
import { ExtractionError } from '@owlieio/core';
import { RssAdapter } from '@owlieio/adapter-rss';
import { buildPdf, paperPdf } from '@owlieio/testing';
import { defaultItemAdapters, ExitCode, run } from 'owlie';
import type { CliDeps, CliIo } from 'owlie';

function capture() {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (chunk: string) => (stdout += chunk) },
    stderr: { write: (chunk: string) => (stderr += chunk), isTTY: false },
    stdin: { isTTY: true, read: async () => '' },
  };
  return { io, stdout: () => stdout, stderr: () => stderr };
}

const dirs: string[] = [];
function tempFile(name: string, bytes: Uint8Array | string): string {
  const dir = mkdtempSync(join(tmpdir(), 'owlie-pdf-'));
  dirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const clock = () => new Date('2026-10-22T00:00:00.000Z');

/** Serves one PDF, honouring `stopReading` the way the real fetcher does. */
function pdfServer(contentType: string | null, pdf: Uint8Array) {
  const requests: string[] = [];
  const text = new TextDecoder().decode(pdf);
  const fetcher: HttpFetcher = {
    async fetch(url, options) {
      requests.push(`text ${url}`);
      if (!url.startsWith('https://example.com/')) throw new ExtractionError(`unexpected ${url}`);
      const head = text.slice(0, 64);
      const stopped = options?.stopReading?.(head, contentType) ?? false;
      return {
        url,
        contentType,
        text: stopped ? head : text,
        ...(stopped ? { partial: true } : {}),
      };
    },
    async fetchBytes(url) {
      requests.push(`bytes ${url}`);
      return { url, contentType, bytes: pdf };
    },
  };
  return { fetcher, requests };
}

function extractDeps(fetcher: HttpFetcher, cacheDir: string): CliDeps {
  return {
    extract: {
      itemAdapters: defaultItemAdapters({ fetcher, cacheDir }),
      feedAdapter: new RssAdapter({ fetcher }),
      clock,
    },
  };
}

describe('extract — PDF URLs through universal dispatch', () => {
  it.each([
    [
      'a declared application/pdf URL without an extension',
      'https://example.com/download/7',
      'application/pdf',
    ],
    ['a .pdf URL', 'https://example.com/paper.pdf', 'application/pdf'],
    [
      'a PDF served as application/octet-stream',
      'https://example.com/file?id=1',
      'application/octet-stream',
    ],
  ])('reads %s as a PDF article', async (_label, url, contentType) => {
    const { fetcher, requests } = pdfServer(contentType, paperPdf());
    const { io, stdout } = capture();
    const code = await run(['extract', url, '--json'], io, extractDeps(fetcher, tempFile('x', '')));

    expect(code).toBe(ExitCode.Success);
    const document = JSON.parse(stdout()).result;
    expect(document).toMatchObject({
      sourceType: 'article',
      canonicalUrl: url,
      title: 'A Study of Careful Extraction',
      metadata: { format: 'pdf', pageCount: 3, pagesRead: 3 },
      provenance: { adapterId: 'article', warnings: [] },
    });
    expect(document.text).toContain('We study how text is extracted from documents');
    expect(requests.filter((r) => r.startsWith('bytes'))).toEqual([`bytes ${url}`]);
  });

  it('reports an encrypted PDF instead of looking for a feed', async () => {
    const { fetcher } = pdfServer(
      'application/pdf',
      buildPdf([{ lines: ['x'] }], { encrypted: true }),
    );
    const { io, stderr } = capture();
    const code = await run(
      ['extract', 'https://example.com/secret.pdf', '--json'],
      io,
      extractDeps(fetcher, tempFile('x', '')),
    );
    expect(code).not.toBe(ExitCode.Success);
    expect(stderr()).toContain('PDF is encrypted');
  });

  it('reads a PDF with --article', async () => {
    const { fetcher } = pdfServer('application/pdf', paperPdf());
    const { io, stdout } = capture();
    const code = await run(
      ['extract', 'https://example.com/download/7', '--article', '--json'],
      io,
      extractDeps(fetcher, tempFile('x', '')),
    );
    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result.metadata).toMatchObject({ format: 'pdf' });
  });
});

describe('extract — local PDF files', () => {
  it('extracts a local PDF as a local document', async () => {
    const path = tempFile('paper.pdf', paperPdf());
    const { io, stdout } = capture();
    const code = await run(['extract', path, '--json'], io, { extract: { clock } });

    expect(code).toBe(ExitCode.Success);
    expect(JSON.parse(stdout()).result).toMatchObject({
      id: `local:file:${resolve(path)}`,
      sourceType: 'local',
      canonicalUrl: '',
      title: 'A Study of Careful Extraction',
      metadata: { format: 'pdf', pageCount: 3, pagesRead: 3 },
      provenance: { adapterId: 'local', fetchedAt: '2026-10-22T00:00:00.000Z' },
    });
  });

  it('recognizes a local PDF by its signature, not its name', async () => {
    const path = tempFile('download', paperPdf());
    const { io, stdout } = capture();
    expect(await run(['extract', path], io, { extract: { clock } })).toBe(ExitCode.Success);
    expect(stdout()).toContain('We study how text is extracted from documents');
  });

  it('rejects URL-only flags for a local PDF', async () => {
    const path = tempFile('paper.pdf', paperPdf());
    const { io, stderr } = capture();
    const code = await run(['extract', path, '--article'], io, { extract: { clock } });
    expect(code).toBe(ExitCode.Usage);
    expect(stderr()).toContain('URL options cannot be used with a local PDF file');
  });

  it('reports a scanned local PDF', async () => {
    const path = tempFile('scan.pdf', buildPdf([{ lines: [] }], { imageOnly: true }));
    const { io, stderr } = capture();
    const code = await run(['extract', path], io, { extract: { clock } });
    expect(code).not.toBe(ExitCode.Success);
    expect(stderr()).toContain('no extractable text (scanned PDF?)');
  });
});

describe('process — local PDF files', () => {
  function fakeProcessor() {
    const requests: ProcessRequest[] = [];
    const processor: ContentProcessor = {
      id: 'fake',
      async process(request) {
        requests.push(request);
        return { output: 'ok', format: 'text', metadata: {} };
      },
    };
    return { processor, requests };
  }

  it('reads a local PDF as PDF text, not UTF-8 bytes', async () => {
    const path = tempFile('paper.pdf', paperPdf());
    const { processor, requests } = fakeProcessor();
    const { io } = capture();
    const code = await run(['process', path, '--prompt', 'Summarize'], io, {
      process: { processor, clock },
    });

    expect(code).toBe(ExitCode.Success);
    expect(requests[0]?.document).toMatchObject({
      id: `local:file:${resolve(path)}`,
      sourceType: 'local',
      metadata: { format: 'pdf', pageCount: 3 },
    });
    expect(requests[0]?.document.text).not.toContain('%PDF');
    expect(requests[0]?.document.text).toContain('We study how text is extracted');
  });

  it('still reads a text file as text', async () => {
    const path = tempFile('notes.txt', 'plain notes');
    const { processor, requests } = fakeProcessor();
    const { io } = capture();
    await run(['process', '--input', path, '--prompt', 'x'], io, { process: { processor, clock } });
    expect(requests[0]?.document.text).toBe('plain notes');
    expect(requests[0]?.document.metadata).toEqual({});
  });
});
