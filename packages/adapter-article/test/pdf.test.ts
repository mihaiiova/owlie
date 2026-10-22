import { describe, expect, it } from 'vitest';
import { CancelledError, ExtractionError } from '@owlieio/core';
import { cleanPdfPages, extractPdfText, parsePdfDate } from '../src/pdf.js';
import { buildPdf, paperPdf } from '@owlieio/testing';

describe('cleanPdfPages', () => {
  it('joins lines into paragraphs and words hyphenated across a line break', () => {
    expect(
      cleanPdfPages([[['We study how text is extract-', 'ed from documents.'], ['Next one.']]]),
    ).toBe('We study how text is extracted from documents.\n\nNext one.');
  });

  it('keeps a hyphen before an uppercase word or a number', () => {
    expect(cleanPdfPages([[['A state-', 'Of-the-art model, GPT-', '4.']]])).toBe(
      'A state- Of-the-art model, GPT- 4.',
    );
  });

  it('drops running headers and footers repeated on most pages, ignoring their numbers', () => {
    const page = (n: number) => [
      ['Proceedings of X, 2024'],
      [`Body of page ${n}.`],
      [`Page ${n} of 3`],
    ];
    expect(cleanPdfPages([page(1), page(2), page(3)])).toBe(
      'Body of page 1.\n\nBody of page 2.\n\nBody of page 3.',
    );
  });

  it('keeps a repeated line when the document is too short to tell it is a header', () => {
    expect(
      cleanPdfPages([
        [['Header'], ['One.']],
        [['Header'], ['Two.']],
      ]),
    ).toBe('Header\n\nOne.\n\nHeader\n\nTwo.');
  });

  it('drops bare page numbers at the top or bottom of a page', () => {
    expect(
      cleanPdfPages([
        [['12'], ['Text.'], ['- 13 -']],
        [['Body.'], ['xiv']],
      ]),
    ).toBe('Text.\n\nBody.');
  });

  it('does not drop a number inside the body', () => {
    expect(cleanPdfPages([[['Intro.'], ['42'], ['More.'], ['Last.']]])).toBe(
      'Intro.\n\n42\n\nMore.\n\nLast.',
    );
  });
});

describe('parsePdfDate', () => {
  it('parses PDF date strings to ISO 8601 UTC', () => {
    expect(parsePdfDate("D:20240115093000+01'00'")).toBe('2024-01-15T08:30:00.000Z');
    expect(parsePdfDate('D:20240115093000Z')).toBe('2024-01-15T09:30:00.000Z');
    expect(parsePdfDate('D:2024')).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns undefined for anything else', () => {
    expect(parsePdfDate('yesterday')).toBeUndefined();
    expect(parsePdfDate(undefined)).toBeUndefined();
    expect(parsePdfDate('D:20241399')).toBeUndefined();
  });
});

describe('extractPdfText', () => {
  it('reads text, info-dict metadata and page counts from a PDF', async () => {
    const result = await extractPdfText(paperPdf());
    expect(result).toMatchObject({
      title: 'A Study of Careful Extraction',
      author: 'Ada Example',
      createdAt: '2024-01-15T08:30:00.000Z',
      pageCount: 3,
      pagesRead: 3,
    });
    expect(result.text).toBe(
      [
        'A Study of Careful Extraction',
        'We study how text is extracted from documents and why it matters.',
        'A second paragraph begins here.',
        'Methods are described on this page in detail.',
        'Results show the approach works well.',
      ].join('\n\n'),
    );
  });

  it('falls back to the upright text in the largest type on the first page', async () => {
    const result = await extractPdfText(
      buildPdf([
        {
          lines: [
            'Permission is granted to reproduce the figures.',
            '',
            { text: 'Attention Is Useful', size: 18 },
            { text: 'arXiv:2401.00001v1 [cs.CL]', size: 20, rotated: true },
            '',
            'The body of the paper is long enough to count as a text layer.',
          ],
        },
      ]),
    );
    expect(result.title).toBe('Attention Is Useful');
    expect(result.text).toContain(
      'Permission is granted to reproduce the figures.\n\nAttention Is Useful\n\n' +
        'The body of the paper is long enough to count as a text layer.',
    );
  });

  it.each([
    ['an arXiv stamp', 'arXiv:hep-th/9901001v3  10 May 1999'],
    ['untitled', 'Untitled document'],
    ['a file name', 'final_draft_v3.docx'],
  ])('ignores an info-dict title that is %s', async (_label, Title) => {
    const result = await extractPdfText(
      buildPdf(
        [
          {
            lines: [
              { text: 'String Junctions and Their Duals', size: 17 },
              '',
              '',
              { text: 'in Heterotic String Theory', size: 17 },
              '',
              'The body of the paper is long enough to count as a text layer.',
            ],
          },
        ],
        { info: { Title } },
      ),
    );
    expect(result.title).toBe('String Junctions and Their Duals in Heterotic String Theory');
  });

  it("judges paragraph gaps against each line's own type size", async () => {
    const result = await extractPdfText(
      buildPdf([
        {
          lines: [
            'A body line set in eleven point type, long enough to read,',
            'and its continuation on the next line.',
            { text: '1 A footnote in smaller type,', size: 8 },
            { text: 'continued here.', size: 8 },
          ],
        },
      ]),
    );
    expect(result.text).toBe(
      'A body line set in eleven point type, long enough to read, and its continuation on the next line.' +
        ' 1 A footnote in smaller type, continued here.',
    );
  });

  it('falls back to the first paragraph when all text on the first page is one size', async () => {
    const result = await extractPdfText(
      buildPdf([
        {
          lines: [
            'Annual Report 2025',
            '',
            'The body text is long enough to count as a text layer.',
          ],
        },
      ]),
    );
    expect(result.title).toBe('Annual Report 2025');
    expect(result.author).toBeUndefined();
  });

  it('reads at most maxPages pages and reports how many it read', async () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      lines: [`Page ${i + 1} has enough words in it to count as real text.`],
    }));
    const result = await extractPdfText(buildPdf(pages), { maxPages: 2 });
    expect(result).toMatchObject({ pageCount: 5, pagesRead: 2 });
    expect(result.text).toBe(
      'Page 1 has enough words in it to count as real text.\n\n' +
        'Page 2 has enough words in it to count as real text.',
    );
  });

  it('rejects an encrypted PDF', async () => {
    const pdf = buildPdf([{ lines: ['Secret.'] }], { encrypted: true });
    await expect(extractPdfText(pdf)).rejects.toThrow(new ExtractionError('PDF is encrypted'));
  });

  it('rejects a PDF with no text layer', async () => {
    const pdf = buildPdf([{ lines: [] }, { lines: [] }], { imageOnly: true });
    await expect(extractPdfText(pdf)).rejects.toThrow('no extractable text (scanned PDF?)');
  });

  it('rejects a malformed PDF', async () => {
    await expect(extractPdfText(new TextEncoder().encode('%PDF-1.4 garbage'))).rejects.toThrow(
      /^invalid PDF: /,
    );
    await expect(extractPdfText(new Uint8Array())).rejects.toBeInstanceOf(ExtractionError);
  });

  it('honours cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractPdfText(paperPdf(), { signal: controller.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it('accepts a Node Buffer', async () => {
    const result = await extractPdfText(Buffer.from(paperPdf()));
    expect(result.pageCount).toBe(3);
  });

  it('does not detach the caller buffer', async () => {
    const bytes = paperPdf();
    await extractPdfText(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
