# ADR 0041 — bioRxiv and medRxiv adapter

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

bioRxiv (biology) and medRxiv (medicine and health) are the main preprint
servers for the life sciences, with over 350,000 preprints between them. They
are run by the same organization, on one platform and one API. Owlie only
reached them by accident:

- A preprint URL went through the article adapter. That returned the abstract
  page under a URL identity that includes the version.
- The per-subject RSS feeds (`connect.biorxiv.org/biorxiv_xml/<subject>`)
  return 404 (checked 2026-10-26), so there is no feed to fall back to.

A general-purpose extractor (ADR 0034) should read a preprint URL as a paper
and list a subject's new preprints, as it does for arXiv (ADR 0040).

## Decision

- **New package `@owlieio/adapter-biorxiv`, new source type `biorxiv`.** One
  adapter pair covers both servers, and `metadata.server` says which
  (`biorxiv | medrxiv`). `BiorxivPaperAdapter` (an `ItemAdapter`) recognizes
  preprints; `BiorxivCollectionAdapter` (a `CollectionAdapter`) recognizes
  subjects. Both report the id `biorxiv`. Recognition is pure:
  - **Preprints:** `biorxiv.org`, `medrxiv.org` (with or without `www.`) at
    `/content/<doi>[vN][.full|.full.pdf|.full-text|.abstract|.supplementary-material|…]`,
    and old `/cgi/content/short/<suffix>[vN]` share links.
  - **DOIs:** `10.1101/YYYY.MM.DD.NNNNNN[NN]` (until 2025) and
    `10.64898/YYYY.MM.DD.NNNNNN[NN]` (current). medRxiv suffixes have eight
    digits. Only the dated pattern counts: Cold Spring Harbor journals share
    the `10.1101` prefix (`10.1101/gr.123456.111`) and must not match. A pure
    `biorxivDoi()` helper reads bare DOIs, `doi:` and `doi.org` links for a
    future DOI input.
  - **Collections:** `<server>.org/collection/<subject>`, and
    `<server>.org/collection` (or `/collection/all`) for a whole server.
- **Subjects come from a static map** (`subjects.ts`): site slug, display
  name and API category name, for both servers. Checked against both sites
  and the API on 2026-10-28. The map exists because the API answers an
  unknown category with every category instead of an error. A listing also
  checks that the category the API echoes is the requested one, and fails
  otherwise. bioRxiv's legacy Clinical Trials and Epidemiology subjects moved
  to medRxiv and are not in the API, so they are not accepted.
- **Identity.**
  - A preprint is `biorxiv:<doi>`, lowercased, with no version, for both
    servers (DOIs don't collide). Its canonical URL is
    `https://www.<server>.org/content/<doi>`. `metadata.version`,
    `latestVersion` and `versionedUrl` record the version read.
  - Collections are `biorxiv:collection:<server>:<subject slug>` and
    `biorxiv:collection:<server>`.
- **Metadata from `api.biorxiv.org`** (`/details/<server>/<doi>`, JSON, one
  record per version): title, ordered authors, corresponding author and
  institution, abstract, server, category, article type, license, the journal
  DOI when published, and the posted date (version 1) and version date. The
  API writes Greek letters as `{beta}`; they are decoded to Unicode. When the
  preprint is published, `/pubs/<server>/<doi>` adds the journal name (best
  effort). The server comes from the API record, not the URL host; a DOI not
  found on the host's server is looked up on the other one.
- **Body text, in this order:**
  1. **The full-text page** (`…/content/<doi>vN.full`). Only its top-level
     `<div class="section">` blocks are handed to the article reader. The
     abstract, acknowledgements, footnotes, data availability, references and
     the site chrome are dropped. A page with no body section, or with fewer
     than 1,500 characters of text, counts as having no full text. This is
     common: recent versions often show only the abstract for days.
  2. **The PDF** (`…/content/<doi>vN.full.pdf`), through the PDF reader (ADR
     0039).
  3. **The abstract alone**, with a `BIORXIV_ABSTRACT_ONLY` warning.

  The API's `jatsxml` link is not used: it returned 404 for papers whose HTML
  and PDF worked. `metadata.textSource` records which source was used. A
  withdrawn preprint (its title or type says so, or its abstract is a
  withdrawal notice for the preprint itself) is not read, and it carries a
  `BIORXIV_WITHDRAWN` warning. `--abstract-only` skips the body
  by request, with no warning.

- **Document text** starts with the title, the authors, then
  `Abstract\n\n<abstract>`, then the body, as for arXiv.
- **Composition.** As for arXiv, the article adapter reads the page and the
  PDF, passed in by `apps/cli` as a core `ItemAdapter &
DeferredResponseItemAdapter`.
- **Listing.** The API only takes date ranges (`/details/<server>/<from>/<to>/<cursor>`),
  returns them oldest first, thirty per page, and has no "latest N" query.
  A listing:
  - covers the last 14 days (UTC);
  - reads the first page to learn the total, then walks the pages from the
    last one back, so the newest preprints come first in few requests. This
    replaces the day-by-day walk in the spec, which needed up to 14 requests
    for a quiet subject;
  - is de-duplicated by DOI, and skips revisions (`version > 1`) unless
    `--include-replacements` is given;
  - is capped at 200 (`MAX_BIORXIV_LIST_LIMIT`), and `--order` does not
    apply.

  Items carry `doi`, `server`, `version`, `authors`, `category`,
  `articleType`, `license` and `published`, and the abstract as the
  description. `extract` on a collection runs the usual bounded batch.

- **Politeness.** biorxiv.org answered 429 to quick repeat requests during
  the 2026-10-26 check. So, per process:
  - API requests are serialized and start at least one second apart;
  - page and PDF requests to the two sites are serialized and start at least
    two seconds apart;
  - on HTTP 429 the adapter waits for `Retry-After` (at most 30 s; 5 s when
    absent) once, then fails with an `ExtractionError` whose details carry
    `httpStatus: 429`, so a consumer can retry later. This applies to the
    full-text page and the PDF too: a rate-limited read never falls back to
    the abstract.

  To support this, core's HTTP errors now carry `details.httpStatus` (and
  `retryAfterSeconds` when the server sent one), and `RequestGate` moved from
  the arXiv package to core so the three paper adapters share it.

- **Flags.** `--abstract-only` and `--include-replacements` now also apply to
  bioRxiv/medRxiv preprint and collection URLs, with the same usage errors
  elsewhere.

## Consequences

- `owlie extract https://www.biorxiv.org/content/<doi>` returns one preprint
  document. `owlie list` and `owlie extract` on
  `https://www.biorxiv.org/collection/neuroscience` return preprints with
  stable identities, newest first.
- There is no keyword search: the API has none. Consumers can filter a
  subject's items themselves.
- A batch of N preprints takes at least 2 × (N − 1) seconds of page spacing.
- Out of scope: other preprint platforms (Research Square, SSRN, OSF,
  ChemRxiv), supplementary material, fetching the journal version, and the
  API's publisher and funder endpoints.
