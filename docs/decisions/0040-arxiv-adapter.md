# ADR 0040 — arXiv adapter

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

arXiv is the main open-access preprint server for physics, mathematics,
computer science, quantitative biology and more. Owlie could only reach it by
accident:

- A paper URL went through the article adapter, which returned the abstract
  page with its chrome, under a URL identity.
- A category RSS feed went through the RSS adapter, keyed by feed GUID. A
  paper cross-listed in two categories, or replaced with a new version, got a
  new identity each time.

A general-purpose extractor (ADR 0034) should read a paper URL as a paper:
clean metadata, the full text, and one stable identity.

## Decision

- **New package `@owlieio/adapter-arxiv`, new source type `arxiv`.** It has
  two adapters. `ArxivPaperAdapter` (an `ItemAdapter`) recognizes papers;
  `ArxivCollectionAdapter` (a `CollectionAdapter`) recognizes category feeds
  and API search queries. Both report the id `arxiv`. Recognition is pure:
  - **Papers:** `arxiv.org`, `www.arxiv.org` and `export.arxiv.org` URLs at
    `/abs/`, `/pdf/` (with or without `.pdf`) and `/html/` (with any trailing
    section path). New-style IDs (`2401.12345`, `0704.0001`) and old-style
    IDs (`hep-th/9901001`, `math.GT/0309136`) are accepted, each with an
    optional version.
  - **Categories:** `rss.arxiv.org/rss|atom/<cat>[+<cat>…]`, the legacy
    `export.arxiv.org/rss/<cat>`, and `arxiv.org/list/<cat>[/new|recent|…]`.
  - **Searches:** `export.arxiv.org/api/query?search_query=…` (or
    `arxiv.org/api/query`).
- **Identity.**
  - A paper is `arxiv:<id>`, with no version. Its canonical URL is
    `https://arxiv.org/abs/<id>`, so cross-lists and replacements share one
    identity. `metadata.version`, `versionedId` and `absUrl` record the
    version read.
  - Collections are `arxiv:list:<cats>` and `arxiv:query:<query>`; the query
    is kept with its whitespace collapsed.
  - Whether a new version deserves new processing is the consumer's decision
    (ADR 0034).
- **Metadata from the arXiv API** (`export.arxiv.org/api/query?id_list=…`,
  Atom): title, ordered authors, abstract, primary and secondary categories,
  published and updated dates, DOI, journal reference and comment. The feed
  is parsed with `fast-xml-parser` using the same safe settings as the
  RSS/Atom parser (ADR 0009): no entity processing, DTDs refused. The adapter
  does not reuse `adapter-rss`, because arXiv's extension elements are not
  part of the generic entry model.
- **Body text, in this order:**
  1. **The HTML render** (`arxiv.org/html/<id>`, LaTeXML), when it is a
     LaTeXML page. Before the article reader sees it:
     - MathML is replaced by its LaTeX `alttext`, as `$…$` inline and `$$…$$`
       for display math. Without this, every formula and the numbers inside
       them are lost: "a rate of ." instead of `$P_{drop}=0.1$`.
     - The title, author block and abstract are removed, since the document
       header already carries them.
     - Footnote marks and "thanks:" labels are removed; the footnote text
       stays.

     A render shorter than 1,000 characters counts as unusable.

  2. **The PDF** (`arxiv.org/pdf/<id>`), through the PDF reader (ADR 0039).
  3. **The abstract alone**, with an `ARXIV_ABSTRACT_ONLY` warning.

  `metadata.textSource` records which one was used. A withdrawn paper (its
  comment or abstract says so) is not read. It carries an `ARXIV_WITHDRAWN`
  warning. `--abstract-only` skips the body by request, with no warning.

- **Document text** starts with the title, the authors, then
  `Abstract\n\n<abstract>`, then the body. Filters and short instructions see
  the abstract first.
- **Composition.** The HTML render and the PDF are read by the article
  adapter. The arXiv adapter receives it as a core `ItemAdapter &
DeferredResponseItemAdapter` through its options, composed in `apps/cli`,
  because adapters depend only on core (as with Hacker News linked articles,
  ADR 0038).
- **Listing.**
  - A category reads its RSS announcement feed. Items carry `arxivId`,
    `version`, `announceType` (`new | cross | replace | replace-cross`),
    authors, categories, license and DOI, and the abstract as the
    description. `replace*` announcements are skipped unless
    `--include-replacements` is given.
  - A search reads the API with `sortBy=submittedDate&sortOrder=descending`.
    Its `collection.metadata.totalResults` is the API's total, and
    `truncated` is true when more results exist.
  - Listings are capped at 200 (`MAX_ARXIV_LIST_LIMIT`).
  - `--order` does not apply: arXiv sets the order.
  - `extract` on a collection URL runs the usual bounded batch (as for
    feeds), and each paper goes through the paper adapter.
- **Politeness** (arXiv API terms):
  - API requests are serialized and start at least three seconds apart, by
    one gate shared per process.
  - Every request goes through the injected `HttpFetcher`, so the User-Agent,
    proxy, SSRF rules, deadlines and byte budgets apply.
  - There is no OAI-PMH or bulk harvesting.
  - HTML and PDF reads are not API requests and are not spaced, but a batch
    reads its papers one at a time.
- **Flags.** `--abstract-only` (extract, arXiv URLs only) and
  `--include-replacements` (list/extract, arXiv category URLs only). Either
  flag on any other URL, `--order` on an arXiv collection, and
  `--abstract-only` on `list` are usage errors.

## Consequences

- `owlie extract https://arxiv.org/abs/<id>` returns one paper document with
  formulas kept. `owlie list` and `owlie extract` on a category or search
  return papers with stable identities.
- `process --each` on an arXiv RSS URL still lists through the generic RSS
  adapter; its linked entries reach the paper adapter through universal
  dispatch.
- A batch of N papers takes at least 3 × (N − 1) seconds of API spacing.
- Out of scope:
  - Other paper sources (bioRxiv, medRxiv, PubMed, Semantic Scholar,
    OpenReview).
  - References parsing and citation graphs.
  - LaTeX source downloads.
