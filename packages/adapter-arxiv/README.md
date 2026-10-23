# @owlieio/adapter-arxiv

arXiv source adapter for Owlie CLI (ADR 0040). Internal package, bundled into
`owlie`; never published.

Requests go through the injected `HttpFetcher`, so the extraction proxy, SSRF
rules, deadlines and byte budgets apply. arXiv API requests are spaced three
seconds apart by one gate per process, as the arXiv API terms ask.

## What it does

- `parseArxivPaperUrl` / `parseArxivCollectionUrl` — pure recognition of paper
  URLs (`/abs/`, `/pdf/`, `/html/`, old and new IDs, optional version), category
  feeds (`rss.arxiv.org/rss/<cat>`, `arxiv.org/list/<cat>`) and API searches
  (`export.arxiv.org/api/query?search_query=…`).
- `ArxivPaperAdapter` — an `ItemAdapter`. Identity `arxiv:<id>` (no version).
  - Metadata comes from the arXiv API.
  - The body comes from the HTML render, prepared by `prepareLatexmlHtml`:
    MathML becomes `$LaTeX$`, and the front matter and footnote marks are
    removed. If that fails, the body comes from the PDF; if that fails too,
    the document has the abstract alone (`ARXIV_ABSTRACT_ONLY`).
  - Withdrawn papers carry `ARXIV_WITHDRAWN`.
- `ArxivCollectionAdapter` — a `CollectionAdapter` for category announcement
  feeds (replacements skipped unless `includeReplacements`) and API searches
  (newest first), bounded by 200.

The HTML render and the PDF are read by the article adapter, which `apps/cli`
passes in as a core `ItemAdapter & DeferredResponseItemAdapter`. This package
depends only on `@owlieio/core`.
