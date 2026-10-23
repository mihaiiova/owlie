import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ExtractionWarning, NormalizedDocument } from '@owlieio/core';
import { buildProvenance, CancelledError, startsWithPdfSignature } from '@owlieio/core';
import { extractPdfText, PDF_TRUNCATED_PAGES } from '@owlieio/adapter-article';

/** The stable identity of a local file: its normalized absolute path. */
export function localFileId(path: string): string {
  return `local:file:${resolve(path)}`;
}

/**
 * Builds a `local` document from a local PDF's bytes, with the same text
 * cleanup, page cap and `metadata.format: 'pdf'` facts as a PDF URL (ADR 0039).
 */
export async function localPdfDocument(
  path: string,
  bytes: Uint8Array,
  options: { fetchedAt: string; signal?: AbortSignal },
): Promise<NormalizedDocument> {
  const pdf = await extractPdfText(bytes, { signal: options.signal });
  const id = localFileId(path);
  const warnings: ExtractionWarning[] =
    pdf.pagesRead < pdf.pageCount
      ? [
          {
            code: PDF_TRUNCATED_PAGES,
            message: `read the first ${pdf.pagesRead} of ${pdf.pageCount} PDF pages`,
          },
        ]
      : [];
  return {
    schemaVersion: 2,
    id,
    sourceType: 'local',
    canonicalUrl: '',
    mediaType: 'text',
    ...(pdf.title ? { title: pdf.title } : {}),
    text: pdf.text,
    ...(pdf.createdAt ? { publishedAt: pdf.createdAt } : {}),
    ...(pdf.author ? { author: pdf.author } : {}),
    metadata: { format: 'pdf', pageCount: pdf.pageCount, pagesRead: pdf.pagesRead },
    provenance: buildProvenance({
      sourceId: id,
      canonicalUrl: '',
      adapterId: 'local',
      text: pdf.text,
      fetchedAt: options.fetchedAt,
      warnings,
    }),
  };
}

/**
 * Reads a local path that is not a URL and returns its bytes when it is a PDF
 * (by its `%PDF-` signature). Returns `undefined` for a URL-shaped input, a
 * missing or unreadable path, a directory, or any other file. Throws
 * {@link CancelledError} when `signal` aborts, including mid-read.
 */
export async function readLocalPdf(
  input: string,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return undefined;
  if (signal?.aborted) throw new CancelledError('reading the local file was cancelled');
  try {
    // Sniff the signature first so a large non-PDF file is never read whole.
    const file = await open(input, 'r');
    let head: Uint8Array;
    try {
      const { buffer, bytesRead } = await file.read({ buffer: new Uint8Array(5), position: 0 });
      head = buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
    return startsWithPdfSignature(head) ? await readFile(input, { signal }) : undefined;
  } catch (error) {
    if (signal?.aborted)
      throw new CancelledError('reading the local file was cancelled', { cause: error });
    return undefined;
  }
}
