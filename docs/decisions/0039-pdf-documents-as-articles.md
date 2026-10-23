# ADR 0039 — PDF documents as articles

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

PDFs are among the most common documents on the web: papers, reports, white
papers, manuals and filings. Owlie could not read them. A PDF URL failed with
`article URL returned unsupported content type: application/pdf`, because the
core fetcher only returned decoded text and the article adapter only accepted
HTML. `owlie process ./paper.pdf` read the file as UTF-8 and sent the model
binary noise. A general-purpose extractor (ADR 0034) should read a PDF as the
document it is.

## Decision

- **A PDF is an article document.** It keeps `sourceType: 'article'` and
  `mediaType: 'text'`. It adds `metadata.format: 'pdf'`, `pageCount` and
  `pagesRead`, and takes title, author and `publishedAt` (the creation date)
  from the PDF info dictionary. Consumers that already handle articles handle
  PDFs unchanged, and they can tell a PDF apart by `metadata.format`. A local
  PDF is a `local` document with the same metadata.
- **Binary fetch in core.** `HttpFetcher.fetchBytes` (optional, like
  `fetchToFile`) returns `{ url, contentType, bytes }`. It goes through the
  same exchange as `fetch`: per-hop SSRF and DNS checks, redirect re-checks,
  the proxy, the deadline and cancellation, the per-response cap (`maxBytes`,
  defaulting to `maxResponseBytes`), and the shared byte budget.
- **Detection.** The `%PDF-` signature decides, not the URL or the declared
  type:
  - A URL whose path ends in `.pdf` is fetched as bytes straight away.
  - Any other page fetch stops at its first chunk when the body declares
    `application/pdf` (or `application/x-pdf`) or starts with `%PDF-`. The
    `stopAtFeedHeader` hook used by page-sniffing fetches (article
    classification, the episode-page resolver, feed discovery) does this too,
    so a large PDF is never read under the 5 MB text-body cap. The article
    adapter then re-fetches the URL as bytes.
  - Bytes without the signature are handled as what they are: an HTML page
    behind a `.pdf` path is read as a page, and a body that declares PDF but
    is not one fails.
  - Page classification counts a PDF as an article (signal `'pdf'`). A PDF
    that cannot be read fails loudly, instead of being treated as "not an
    article" and sent to feed discovery.
- **Extractor: `unpdf` (pdf.js, pure JS).** There is no Python and no native
  code (in line with ADR 0006), and the hosted container needs nothing extra.
  pdf.js runs with logging silenced (`verbosity: 0`), so nothing reaches the
  protocol stderr. It runs with no font faces and no system fonts. Its
  serverless build generates no code for fonts. The caller's buffer is copied
  before parsing. `unpdf` is a runtime dependency of the published package
  (not bundled).
- **Text cleanup:**
  - Lines are grouped from pdf.js items by baseline.
  - A paragraph ends where the gap to the next line exceeds 1.5 × the type
    size, or where the text moves up the page (a new column).
  - Words hyphenated across a line break are joined when the next line
    starts in lowercase.
  - In documents of three or more pages, a line at the top or bottom of more
    than half the pages (numbers ignored) is a running header or footer and
    is dropped. Bare page numbers at a page's first or last line are dropped.
  - Paragraphs and pages are separated by a blank line.
- **Title.** The info-dict title is used unless it is an arXiv identifier
  stamp, "untitled", or a file name. Otherwise the title is the upright text
  in the largest type on the first page; rotated text such as arXiv's margin
  stamp is skipped.
- **Limits.** Downloads are capped at 25 MB (`pdf.maxBytes` on the article
  adapter). At most 300 pages are read (`pdf.maxPages`). Past the page cap,
  the document carries the `PDF_TRUNCATED_PAGES` warning, and `pagesRead` is
  below `pageCount`.
- **Errors** are `ExtractionError`s:
  - `PDF is encrypted` (a user password is required)
  - `no extractable text (scanned PDF?)` (fewer than 50 non-whitespace
    characters)
  - `invalid PDF: …`
  - the usual size errors

  A PDF with only an owner password (printing or copying restricted) is
  readable and is read.

- **Local files.** `owlie extract ./file.pdf` and `owlie process ./file.pdf`
  read a local file as a PDF when it starts with `%PDF-`. The signature is
  sniffed before the file is read whole. URL-only flags (resolvers,
  `--article`/`--feed`, Hacker News options) are usage errors with a local
  PDF.
- **Capabilities.** `owlie capabilities` reports
  `documentFormats: ['html', 'pdf']`, so a consumer can require PDF support at
  startup.

## Consequences

- PDF URLs work everywhere an article does: `extract`, `extract --article`,
  `process URL`, linked-item feed extraction, and Hacker News linked articles.
- A PDF URL without a `.pdf` path costs one extra request: a one-chunk text
  probe, then the byte fetch.
- Out of scope:
  - OCR for scanned PDFs.
  - Tables, figures and equations as structure.
  - Reading order beyond what pdf.js gives.
  - Other binary document formats (DOCX, EPUB).
