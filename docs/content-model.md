# Content model

Owlie models **collections** and **items** separately, with a provider-neutral
`NormalizedDocument` as the extraction output.

## Collections

| Source                     | Identity example                              |
| -------------------------- | --------------------------------------------- |
| YouTube playlist           | `youtube:playlist:<id>`                       |
| Subreddit                  | `reddit:subreddit:<lowercased>`               |
| RSS/Atom feed              | `rss:feed:<canonical-url>`                    |
| Hacker News list           | `hackernews:list:<top\|new\|best\|ask\|show>` |
| Hacker News user's stories | `hackernews:user:<name>`                      |
| arXiv category feed        | `arxiv:list:<cat>[+<cat>…]`                   |
| arXiv search query         | `arxiv:query:<query>`                         |
| bioRxiv/medRxiv subject    | `biorxiv:collection:<server>:<subject>`       |
| bioRxiv/medRxiv server     | `biorxiv:collection:<server>`                 |
| PubMed search              | `pubmed:search:<query>`                       |

A collection has a stable `id`, a `sourceType`, a `canonicalUrl`, an optional
title, and `metadata`.

## Items

| Source                   | Identity example                         |
| ------------------------ | ---------------------------------------- |
| YouTube video            | `youtube:video:<id>`                     |
| Podcast episode          | `podcast:episode:<url>`                  |
| Reddit post              | derived from feed entry                  |
| RSS/Atom entry           | derived from feed entry                  |
| Hacker News item         | `hackernews:item:<id>`                   |
| arXiv paper              | `arxiv:<id>` (no version)                |
| bioRxiv/medRxiv preprint | `biorxiv:<doi>` (lowercased, no version) |
| PubMed article           | `pubmed:<pmid>` (or `pubmed:PMC<id>`)    |

An item has a stable `id`, a `sourceType`, a `canonicalUrl`, optional
title/description/publishedAt/author, and `metadata`.

## Normalized documents

Extraction produces a `NormalizedDocument` with `schemaVersion: 2`, a stable
`id`, `sourceType`, `canonicalUrl`, a `mediaType` (`text` | `transcript` |
`mixed`), the normalized `text`, optional title/publishedAt/author and
metadata, and a required first-class `provenance` field.

Not every document is a transcript:

- YouTube and podcast documents may contain transcripts.
- Reddit and RSS documents contain normalized written text.
- Article documents contain the page's readable text with its structure kept:
  paragraphs, headings and other blocks are separated by a blank line; list
  items, table rows and line breaks start a new line; preformatted (`<pre>`)
  lines are kept as they are; and escaped text such as `&lt;div&gt;` appears
  literally as `<div>`. Markup itself is not kept. Content inside custom elements (tag names
  with a hyphen, such as `<uni-article-paragraph>`) is kept; their tags are not.
- PDF documents (ADR 0039) are article documents (`sourceType: 'article'`,
  `mediaType: 'text'`) with `metadata.format: 'pdf'`, `metadata.pageCount`
  and `metadata.pagesRead`. Their text is the PDF's text layer as paragraphs
  separated by a blank line: running headers, footers and page numbers are
  dropped, and words hyphenated across a line break are joined. Title, author
  and `publishedAt` (creation date) come from the PDF info dictionary when
  present; the title otherwise is the largest upright text on the first page.
  A PDF longer than the page cap carries the `PDF_TRUNCATED_PAGES` warning.
- Hacker News documents contain written text: the post and a bounded comment
  tree, the linked article, or both, as chosen by `--hn-content` (ADR 0038).
- arXiv documents (ADR 0040, `sourceType: 'arxiv'`) start with the title, the
  authors and `Abstract` followed by the abstract, then the paper body: the
  HTML render with formulas as LaTeX (`$…$`, `$$…$$`), else the PDF text,
  else nothing (`ARXIV_ABSTRACT_ONLY`). `metadata` carries `arxivId`,
  `version`, `versionedId`, `authors`, `primaryCategory`, `categories`,
  `abstract`, `published`, `updated`, `comment`, `doi`, `journalRef`,
  `absUrl`, `pdfUrl` and `textSource` (`html | pdf | abstract`).
- bioRxiv and medRxiv documents (ADR 0041, `sourceType: 'biorxiv'`) start the
  same way, then the preprint body: the full-text page's body sections, else
  the PDF text, else nothing (`BIORXIV_ABSTRACT_ONLY`). `publishedAt` is the
  date version 1 was posted. `metadata` carries `doi`, `server`
  (`biorxiv | medrxiv`), `version`, `latestVersion`, `authors`,
  `correspondingAuthor`, `correspondingInstitution`, `category`,
  `articleType`, `license`, `published` (journal DOI) and `journal`,
  `journalPublishedDate`, `abstract`, `posted`, `versionDate`, `versionedUrl`,
  `htmlUrl`, `pdfUrl` and `textSource` (`html | pdf | abstract`).
- PubMed documents (ADR 0042, `sourceType: 'pubmed'`) start with the title,
  the authors, the journal and date, then `Abstract` and the abstract
  (structured labels as headings), then the PMC full text when it is open
  (`PUBMED_ABSTRACT_ONLY` otherwise). `metadata` carries `pmid`, `pmcid`,
  `doi`, `authors`, `affiliations`, `journal`, `journalAbbreviation`,
  `volume`, `issue`, `pages`, `publicationDate`, `publicationTypes`,
  `meshHeadings`, `keywords`, `language`, `retracted`, `abstract`,
  `pubmedUrl`, `pmcUrl` and `textSource` (`pmc | abstract`).
- Local documents (`sourceType: 'local'`) contain user-supplied text with no
  remote canonical URL (represented as an empty string). Their identity is
  `local:stdin` for piped stdin or `local:file:<normalized-absolute-path>` for
  a file. A local PDF carries the same `metadata.format: 'pdf'` facts as a PDF
  URL.

### Provenance

Every v2 document carries `provenance` with:

- `sourceId` — the stable idempotency identity, distinct from the content
  fingerprint. Adapter item identities remain authoritative; podcast resolver
  extraction derives it from the canonical supplied locator (never the
  resolved/signed media URL).
- `canonicalUrl` — the redacted canonical source URL (no userinfo, query, or
  fragment).
- `adapterId` — the adapter that produced the document.
- `resolverId` — the selected podcast resolver, when resolver extraction
  produced it.
- `fetchedAt` — the ISO-8601 UTC timestamp stamped once at the CLI boundary.
- `language` — the normalized transcript language when available.
- `contentFingerprint` — `{ algorithm: "sha256", digest }` over the exact
  normalized document `text` UTF-8 bytes (source identity and mutable metadata
  are excluded).
- `warnings` — structured `{ code, message }` entries with stable codes, so
  consumers can count them without reading messages: `ARTICLE_FALLBACK`
  (article text taken from a page that is not an article),
  `article_text_recovered` (article text recovered from Readability's
  unsanitized output because sanitizing removed it), `PDF_TRUNCATED_PAGES`,
  `ARXIV_ABSTRACT_ONLY`, `ARXIV_WITHDRAWN`, `BIORXIV_ABSTRACT_ONLY`,
  `BIORXIV_WITHDRAWN`, `PUBMED_ABSTRACT_ONLY`, `PUBMED_RETRACTED`,
  `PUBMED_NO_CONTACT`, `HN_COMMENTS_TRUNCATED`,
  `HN_NO_LINKED_ARTICLE`, `HN_ARTICLE_UNAVAILABLE`.

## Stable identities

Identities must be stable across runs so callers can correlate items and
deduplicate results. Adapters derive them from canonical URLs and provider
identifiers — never from volatile page structure. Local documents derive their
identity from the resolved input (stdin or the normalized absolute file path),
which stays stable for the same input.

## Discriminated unions

`ProgressEvent` is a discriminated union on `type` (`started`, `progress`,
`item`, `completed`, `failed`, `cancelled`). `SourceType` and `MediaType` are
string-literal unions. Use unions where they improve safety.
