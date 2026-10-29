# @owlieio/adapter-pubmed

PubMed and PubMed Central source adapter for Owlie CLI (ADR 0042). Internal
package, bundled into `owlie`; never published.

Requests go through the injected `HttpFetcher`, so the extraction proxy, SSRF
rules, deadlines and byte budgets apply. NCBI requests carry `tool=owlie`, the
configured contact email and optional API key, and are spaced to three a
second (ten with a key) by one gate per process.

## What it does

- `parsePubmedArticleUrl` / `parsePubmedSearchUrl` / `pubmedIds` — pure
  recognition of PubMed, PMC and Europe PMC article URLs and PubMed search
  URLs (common `filter=` values translated into query syntax).
- `PubmedArticleAdapter` — an `ItemAdapter`. Identity `pubmed:<pmid>` (PMC
  URLs resolve to their PMID; `pubmed:PMC<id>` when there is none). Metadata
  from PubMed XML; the body from the PMC JATS full text, else the abstract
  (`PUBMED_ABSTRACT_ONLY`). Retracted articles carry `PUBMED_RETRACTED`.
- `PubmedSearchAdapter` — a `CollectionAdapter`: newest articles by
  publication date, bounded by 200.
- `parsePmcArticle` / `jatsBodyToText` — JATS to plain text.

This package depends only on `@owlieio/core`.
