/**
 * Builds small, deterministic PDF documents for tests: Helvetica text pages
 * with uncompressed content streams, an optional info dictionary, and an
 * optional standard-security `/Encrypt` dictionary whose keys match no
 * password (so readers report the document as password-protected).
 *
 * A page is a list of lines. An empty string leaves a blank line's worth of
 * vertical space, which PDF text extraction sees as a paragraph gap. A line
 * given as `{ text, size }` is set in that type size (11 pt otherwise); with
 * `rotated: true` it is drawn turned 90°, like a margin stamp.
 */
export type PdfFixtureLine = string | { text: string; size: number; rotated?: boolean };

export interface PdfFixturePage {
  lines: readonly PdfFixtureLine[];
}

export interface PdfFixtureOptions {
  info?: { Title?: string; Author?: string; CreationDate?: string };
  encrypted?: boolean;
  /** Pages with no text at all (a drawn rectangle), like a scanned page. */
  imageOnly?: boolean;
}

const LINE_HEIGHT = 14;

function pdfString(value: string): string {
  return `(${value.replace(/[\\()]/g, (char) => `\\${char}`)})`;
}

function pageContent(page: PdfFixturePage, imageOnly: boolean): string {
  if (imageOnly) return '0 0 0 rg 72 72 400 600 re f';
  const ops = ['BT', '/F1 11 Tf', `72 760 Td`];
  let pendingGap = 0;
  let first = true;
  let size = 11;
  for (const line of page.lines) {
    if (line === '') {
      pendingGap += LINE_HEIGHT;
      continue;
    }
    if (typeof line !== 'string' && line.rotated) continue;
    const text = typeof line === 'string' ? line : line.text;
    const lineSize = typeof line === 'string' ? 11 : line.size;
    const leading = typeof line === 'string' ? LINE_HEIGHT : lineSize * 1.3;
    if (!first) ops.push(`0 ${-(leading + pendingGap)} Td`);
    if (lineSize !== size) {
      ops.push(`/F1 ${lineSize} Tf`);
      size = lineSize;
    }
    ops.push(`${pdfString(text)} Tj`);
    pendingGap = 0;
    first = false;
  }
  ops.push('ET');
  for (const line of page.lines) {
    if (typeof line === 'string' || !line.rotated) continue;
    ops.push('BT', `/F1 ${line.size} Tf`, '0 1 -1 0 40 200 Tm', `${pdfString(line.text)} Tj`, 'ET');
  }
  return ops.join('\n');
}

export function buildPdf(
  pages: readonly PdfFixturePage[],
  options: PdfFixtureOptions = {},
): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add('');
  const pagesRef = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (const page of pages) {
    const content = pageContent(page, options.imageOnly ?? false);
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  objects[pagesRef - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let info: number | undefined;
  if (options.info) {
    const entries = Object.entries(options.info)
      .map(([key, value]) => `/${key} ${pdfString(value)}`)
      .join(' ');
    info = add(`<< ${entries} >>`);
  }
  let encrypt: number | undefined;
  if (options.encrypted) {
    const key = '11'.repeat(32);
    encrypt = add(`<< /Filter /Standard /V 1 /R 2 /O <${key}> /U <${key}> /P -4 >>`);
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const trailer = [`/Size ${objects.length + 1}`, `/Root ${catalog} 0 R`];
  if (info) trailer.push(`/Info ${info} 0 R`);
  if (encrypt) {
    const id = '22'.repeat(16);
    trailer.push(`/Encrypt ${encrypt} 0 R`, `/ID [<${id}> <${id}>]`);
  }
  body += `trailer\n<< ${trailer.join(' ')} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** A short paper: running header and footer, hyphenation, paragraphs, page numbers. */
export function paperPdf(): Uint8Array {
  const page = (number: number, body: readonly string[]): PdfFixturePage => ({
    lines: ['Journal of Useful Results, Vol. 3', '', ...body, '', String(number)],
  });
  return buildPdf(
    [
      page(1, [
        'A Study of Careful Extraction',
        '',
        'We study how text is extract-',
        'ed from documents and why it',
        'matters.',
        '',
        'A second paragraph begins here.',
      ]),
      page(2, ['Methods are described on this', 'page in detail.']),
      page(3, ['Results show the approach', 'works well.']),
    ],
    {
      info: {
        Title: 'A Study of Careful Extraction',
        Author: 'Ada Example',
        CreationDate: "D:20240115093000+01'00'",
      },
    },
  );
}
