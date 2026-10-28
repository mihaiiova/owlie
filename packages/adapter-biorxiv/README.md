# @owlieio/adapter-biorxiv

bioRxiv and medRxiv source adapter for Owlie CLI (ADR 0041). Internal package,
bundled into `owlie`; never published.

Requests go through the injected `HttpFetcher`, so the extraction proxy, SSRF
rules, deadlines and byte budgets apply. `api.biorxiv.org` requests are spaced
one second apart, and page and PDF requests to `biorxiv.org`/`medrxiv.org` two
seconds apart, by one gate each per process. On HTTP 429 the adapter waits for
`Retry-After` (at most thirty seconds) once, then fails.

## What it does

- `parseBiorxivPaperUrl` / `parseBiorxivCollectionUrl` / `biorxivDoi` — pure
  recognition of preprint URLs (`/content/<doi>[vN][.full|.full.pdf|…]`, old
  `/cgi/content/short/` links), preprint DOIs (`10.1101/YYYY.MM.DD.N…` and
  `10.64898/…`; Cold Spring Harbor journal DOIs do not match) and subject
  collections (`/collection/<subject>`, or `/collection` for a whole server).
- `BiorxivPaperAdapter` — an `ItemAdapter`. Identity `biorxiv:<doi>` (no
  version), for both servers.
  - Metadata comes from the API's details endpoint, and the journal of a
    published preprint from its pubs endpoint.
  - The body comes from the full-text page, prepared by `prepareBiorxivHtml`
    (body sections only). Recent versions often have no full-text page yet;
    then the body comes from the PDF, and failing that the document has the
    abstract alone (`BIORXIV_ABSTRACT_ONLY`).
  - Withdrawn preprints carry `BIORXIV_WITHDRAWN`.
- `BiorxivCollectionAdapter` — a `CollectionAdapter` for subjects and whole
  servers: the last fourteen days, newest first, revisions skipped unless
  `includeReplacements`, bounded by 200. The subject map in `subjects.ts` is
  the only list of accepted subjects, because the API answers an unknown
  category with every category.

The full-text page and the PDF are read by the article adapter, which
`apps/cli` passes in as a core `ItemAdapter & DeferredResponseItemAdapter`.
This package depends only on `@owlieio/core`.
