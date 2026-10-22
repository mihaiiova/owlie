import { getDocumentProxy } from 'unpdf';
import { CancelledError, ExtractionError } from '@owlieio/core';

/** Default cap on a PDF download, in bytes. */
export const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Default cap on the pages read from one PDF. */
export const DEFAULT_MAX_PDF_PAGES = 300;
/** Below this many non-whitespace characters a PDF counts as having no text layer. */
const MIN_PDF_TEXT_CHARS = 50;
const MAX_FALLBACK_TITLE_CHARS = 200;

/** Limits applied to PDF documents. */
export interface PdfLimits {
  /** Download cap in bytes; defaults to {@link DEFAULT_MAX_PDF_BYTES}. */
  maxBytes?: number;
  /** Pages read; later pages are skipped. Defaults to {@link DEFAULT_MAX_PDF_PAGES}. */
  maxPages?: number;
}

export interface PdfExtractionOptions {
  maxPages?: number;
  signal?: AbortSignal;
}

/** The text and document facts read from one PDF. */
export interface PdfText {
  text: string;
  /** The info-dict title, or the text set in the largest type on the first page. */
  title?: string;
  author?: string;
  /** The info-dict creation date, as ISO 8601 UTC. */
  createdAt?: string;
  pageCount: number;
  pagesRead: number;
}

/**
 * One paragraph: its lines in reading order, its largest type size, and
 * whether all of it is set upright (not rotated, like a margin stamp).
 */
interface PdfParagraph {
  lines: string[];
  height: number;
  upright: boolean;
}

interface TextItemLike {
  str?: string;
  transform?: number[];
  height?: number;
  hasEOL?: boolean;
}

/** Type size assumed when pdf.js reports none. */
const FALLBACK_TYPE_SIZE = 12;

/**
 * Groups a page's text items into lines and the lines into paragraphs. A line
 * ends at an end-of-line marker or a baseline change. A paragraph ends where
 * the gap to the next line is wider than 1.5 × the type size (ordinary leading
 * is about 1.2 ×), or where the text moves up the page (a new column). The
 * gap is judged against the lines' own type size, so footnotes and headings
 * on the same page do not skew it.
 */
function pageParagraphs(items: readonly TextItemLike[]): PdfParagraph[] {
  type Line = { text: string; y: number; height: number; upright: boolean };
  const lines: Line[] = [];
  let current: Line | undefined;
  const close = () => {
    if (current && current.text.trim()) lines.push({ ...current, text: current.text.trim() });
    current = undefined;
  };
  for (const item of items) {
    const y = item.transform?.[5] ?? 0;
    const height = item.height ?? 0;
    if (current && Math.abs(current.y - y) > Math.max(current.height, height) / 2) close();
    if (item.str) {
      current ??= { text: '', y, height, upright: true };
      current.text += item.str;
      current.height = Math.max(current.height, height);
      if (item.transform?.[1] || item.transform?.[2]) current.upright = false;
    }
    if (item.hasEOL) close();
  }
  close();

  const paragraphs: PdfParagraph[] = [];
  let paragraph: PdfParagraph | undefined;
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (previous && paragraph) {
      const gap = previous.y - line.y;
      const typeSize = Math.max(previous.height, line.height) || FALLBACK_TYPE_SIZE;
      if (gap < 0 || gap > typeSize * 1.5) {
        paragraphs.push(paragraph);
        paragraph = undefined;
      }
    }
    paragraph ??= { lines: [], height: 0, upright: true };
    paragraph.lines.push(line.text);
    paragraph.height = Math.max(paragraph.height, line.height);
    paragraph.upright &&= line.upright;
  });
  if (paragraph) paragraphs.push(paragraph);
  return paragraphs;
}

/**
 * The upright text set in the largest type on the first page, which is where
 * a document's title almost always is. Rotated text (such as arXiv's margin
 * stamp) is skipped. Used when the info dict has no title.
 */
function largestTypeText(paragraphs: readonly PdfParagraph[]): string | undefined {
  let start = -1;
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.upright && (start < 0 || paragraph.height > paragraphs[start]!.height)) {
      start = index;
    }
  });
  if (start < 0) return undefined;
  // A title set over several lines can be split into adjacent paragraphs.
  // When the whole page is one size there is no title size, so only the
  // first paragraph counts.
  const size = paragraphs[start]!.height;
  const sameSize = (paragraph: PdfParagraph) => Math.abs(paragraph.height - size) <= 0.5;
  const following = paragraphs.every(sameSize) ? [] : paragraphs.slice(start + 1);
  const lines = [...paragraphs[start]!.lines];
  for (const paragraph of following) {
    if (!paragraph.upright || !sameSize(paragraph)) break;
    lines.push(...paragraph.lines);
  }
  const text = joinLines(lines);
  return text ? text.slice(0, MAX_FALLBACK_TITLE_CHARS) : undefined;
}

/**
 * Whether an info-dict title names the document rather than being a stamp or
 * leftover: arXiv sets the identifier stamp as the title of papers it
 * re-renders, and many tools leave "untitled" or the source file name.
 */
function isUsableInfoTitle(title: string): boolean {
  return (
    !/^arxiv:/i.test(title) &&
    !/^untitled\b/i.test(title) &&
    !/\.(?:pdf|docx?|odt|rtf|tex|dvi|ps|indd|pages|pptx?|xlsx?)$/i.test(title)
  );
}

const PAGE_NUMBER_LINE =
  /^[-–—\s]*(?:page\s+)?(?:\d{1,4}|[ivxlc]{1,6})(?:\s*(?:of|\/)\s*\d{1,4})?[-–—\s]*$/i;

function runningLineKey(line: string): string {
  return line.trim().toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
}

/** Joins a paragraph's lines, closing words hyphenated across a line break. */
function joinLines(lines: readonly string[]): string {
  let text = '';
  for (const line of lines) {
    if (!text) text = line;
    else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(line)) text = text.slice(0, -1) + line;
    else text += ` ${line}`;
  }
  return text;
}

/**
 * Turns pages of paragraphs into plain text: running headers and footers
 * (a line at the top or bottom of more than half the pages, numbers ignored,
 * in documents of three or more pages) and bare page numbers are dropped,
 * lines are joined into paragraphs, and paragraphs and pages are separated by
 * a blank line.
 */
export function cleanPdfPages(pages: readonly (readonly (readonly string[])[])[]): string {
  // The first and last two lines are where headers and footers sit; on a page
  // of four lines or fewer only the very first and last are.
  const isEdge = (index: number, length: number): boolean => {
    const depth = length > 4 ? 2 : 1;
    return index < depth || index >= length - depth;
  };
  const edgeLines = (page: readonly (readonly string[])[]): string[] => {
    const flat = page.flat();
    return [...new Set(flat.filter((_, i) => isEdge(i, flat.length)).map(runningLineKey))];
  };
  const running = new Set<string>();
  if (pages.length >= 3) {
    const counts = new Map<string, number>();
    for (const page of pages) {
      for (const key of edgeLines(page)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) if (count > pages.length / 2) running.add(key);
  }

  const blocks: string[] = [];
  for (const page of pages) {
    const flat = page.flat();
    const lastIndex = flat.length - 1;
    let index = -1;
    for (const paragraph of page) {
      const kept = paragraph.filter((line) => {
        index += 1;
        if (isEdge(index, flat.length) && running.has(runningLineKey(line))) return false;
        if ((index === 0 || index === lastIndex) && PAGE_NUMBER_LINE.test(line)) return false;
        return true;
      });
      if (kept.length > 0) blocks.push(joinLines(kept));
    }
  }
  return blocks.join('\n\n');
}

const PDF_DATE =
  /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(\d{2})?'?)?/;

/** Parses a PDF date string (`D:YYYYMMDDHHmmSS+HH'mm'`) to ISO 8601 UTC. */
export function parsePdfDate(value: string | undefined): string | undefined {
  const match = value ? PDF_DATE.exec(value) : null;
  if (!match) return undefined;
  const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00'] = match;
  const sign = match[8];
  const offset = sign ? `${sign}${match[9]}:${match[10] ?? '00'}` : 'Z';
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
  if (Number.isNaN(parsed.getTime()) || Number(month) > 12 || Number(day) > 31) return undefined;
  return parsed.toISOString();
}

function infoString(info: Record<string, unknown>, key: string): string | undefined {
  const value = info[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pdfError(error: unknown): ExtractionError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException')
    return new ExtractionError('PDF is encrypted', { cause: error });
  const message = error instanceof Error ? error.message : String(error);
  return new ExtractionError(`invalid PDF: ${message}`, { cause: error });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError('PDF extraction cancelled');
}

/**
 * Reads the text layer of a PDF with pdf.js (through `unpdf`, pure JS, with
 * no code generation for fonts). pdf.js logging is silenced, so nothing is
 * written to the process's stderr. Throws {@link ExtractionError} for an
 * encrypted, malformed, or text-less (scanned) PDF.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  options: PdfExtractionOptions = {},
): Promise<PdfText> {
  throwIfAborted(options.signal);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PDF_PAGES;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js may take ownership of the buffer it is given, so it gets a copy,
    // and it rejects a Node Buffer, so the copy is a plain Uint8Array.
    pdf = await getDocumentProxy(new Uint8Array(bytes), {
      verbosity: 0,
      disableFontFace: true,
      useSystemFonts: false,
    });
  } catch (error) {
    throw pdfError(error);
  }

  try {
    const pagesRead = Math.min(pdf.numPages, maxPages);
    const pages: PdfParagraph[][] = [];
    for (let number = 1; number <= pagesRead; number += 1) {
      throwIfAborted(options.signal);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(pageParagraphs(content.items as TextItemLike[]));
      page.cleanup();
    }
    throwIfAborted(options.signal);

    const text = cleanPdfPages(pages.map((page) => page.map((paragraph) => paragraph.lines)));
    if (text.replace(/\s/g, '').length < MIN_PDF_TEXT_CHARS) {
      throw new ExtractionError('no extractable text (scanned PDF?)');
    }
    const info = ((await pdf.getMetadata().catch(() => undefined))?.info ?? {}) as Record<
      string,
      unknown
    >;
    const infoTitle = infoString(info, 'Title');
    const title =
      (infoTitle && isUsableInfoTitle(infoTitle) ? infoTitle : undefined) ??
      largestTypeText(pages[0] ?? []);
    const author = infoString(info, 'Author');
    const createdAt = parsePdfDate(infoString(info, 'CreationDate'));
    return {
      text,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(createdAt ? { createdAt } : {}),
      pageCount: pdf.numPages,
      pagesRead,
    };
  } catch (error) {
    if (error instanceof CancelledError || error instanceof ExtractionError) throw error;
    throw pdfError(error);
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
