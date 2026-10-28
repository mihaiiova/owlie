# ADR 0042 — PubMed and PubMed Central adapter

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

PubMed indexes about 38 million biomedical citations, and PubMed Central (PMC)
holds the free full text of about 10 million of them. Clinicians and
biomedical researchers follow PubMed searches to keep up with their field.
Owlie read a PubMed URL as a generic web page (the abstract plus page chrome,
keyed by URL), could not list a search, and never found the PMC full text.

(The research spec numbered this ADR 0043 and reserved 0042 for a DOI
resolver. The DOI work was parked, so this ADR takes the next free number.)

## Decision

- **New package `@owlieio/adapter-pubmed`, new source type `pubmed`**, built
  on NCBI's E-utilities. `PubmedArticleAdapter` (an `ItemAdapter`) and
  `PubmedSearchAdapter` (a `CollectionAdapter`) both report the id `pubmed`.
  Recognition is pure:
  - **Articles:** `pubmed.ncbi.nlm.nih.gov/<pmid>`, the legacy
    `www.ncbi.nlm.nih.gov/pubmed/<pmid>`, `pmc.ncbi.nlm.nih.gov/articles/PMC<id>`,
    `www.ncbi.nlm.nih.gov/pmc/articles/PMC<id>`, and Europe PMC's
    `/article/MED/<pmid>` and `/article/PMC/PMC<id>`.
  - **Searches:** `pubmed.ncbi.nlm.nih.gov/?term=<query>[&filter=…]`. The
    common filters are translated into query syntax (checked against esearch
    on 2026-10-28): free full text `ffrft[Filter]`, full text `fft[Filter]`,
    abstract `hasabstract`, `years.A-B` → `A:B[dp]`, and the review,
    systematic review, meta-analysis, RCT and clinical trial publication
    types. Other filters are ignored, listed in
    `collection.metadata.ignoredFilters`, with a `PUBMED_FILTER_IGNORED`
    warning in `collection.metadata.warnings`.
- **Identity.**
  - An article is `pubmed:<pmid>`, canonical URL
    `https://pubmed.ncbi.nlm.nih.gov/<pmid>/`. A PMC or Europe PMC URL is
    resolved to its PMID through the PMC ID converter during extraction, so it
    gets the same identity.
  - A PMC article with no PMID (some preprints and author manuscripts) is
    `pubmed:PMC<id>`, canonical URL on `pmc.ncbi.nlm.nih.gov`, with metadata
    from its JATS front matter.
  - A search is `pubmed:search:<query>`, with the effective query
    lowercased and its whitespace collapsed.
- **Metadata** from `efetch db=pubmed retmode=xml`: title, ordered authors
  (collective names too), affiliations, the abstract (structured labels such
  as BACKGROUND and METHODS become paragraph headings), journal and its
  abbreviation, volume, issue, pages, publication date (the electronic date
  when given, else the issue date), publication types, MeSH headings,
  keywords, language, DOI and PMCID. DOI and PMCID come from the article's
  own `ArticleIdList`, not those of its references.
- **Body text, in this order:**
  1. **PMC full text** (`efetch db=pmc`, JATS), when the article has a PMCID
     and PMC returns a `<body>` of at least 1,000 characters. Section titles
     become their own paragraphs; figure and table captions are kept with
     their labels; formulas become LaTeX from `tex-math` (else MathML
     `alttext`); lists become `- ` lines; citation markers, graphics, tables'
     cells, supplementary files and references are dropped, and so is a
     section left empty by that.
  2. **The abstract alone**, with `PUBMED_ABSTRACT_ONLY`.

  `metadata.textSource` is `pmc | abstract`. `--abstract-only` skips step 1,
  with no warning. A retracted article (publication type "Retracted
  Publication") is still extracted, with `PUBMED_RETRACTED` and
  `metadata.retracted: true`.

- **The JATS converter lives in this package**, not in core as the spec
  suggested: it needs an XML parser, which core does not carry, and it has
  one user so far. A DOI resolver or Europe PMC path can import it later.
- **Document text** starts with the title, the authors, the journal and date,
  then `Abstract\n\n<abstract>`, then the body.
- **Listing.** `esearch db=pubmed sort=pub_date retmax=<limit>` then one
  `esummary` for the titles, dates, authors, journal, publication types, DOI
  and PMCID. Capped at 200 (`MAX_PUBMED_LIST_LIMIT`), no `usehistory` paging.
  `collection.metadata.totalResults` is NCBI's count, `queryMessages` carries
  NCBI's notes about the query, and `truncated` is true when more articles
  match. An `ERROR` from esearch is an `ExtractionError` with NCBI's message.
  `--order` does not apply.
- **Politeness** (E-utilities policy):
  - Every request sends `tool=owlie`, and `email=<contact>` when a contact
    email is set. Without one the adapter still works, and each PubMed
    document carries `PUBMED_NO_CONTACT`.
  - At most three requests a second per process, or ten with an NCBI API key
    (`api_key=`), through one shared gate per rate.
  - Requests go through the injected `HttpFetcher` (User-Agent, proxy, SSRF,
    deadlines, budgets). Error messages and records never include query
    strings, so the API key does not leak.
- **Settings.** `--contact-email` / `OWLIE_CONTACT_EMAIL` and
  `--ncbi-api-key` / `OWLIE_NCBI_API_KEY` (extract, list and process). Each
  is read from its flag, then the process environment, then `--env-file`,
  `.env.local` and `.env`; hosted mode reads the flag and process environment
  only. The key only raises a rate limit, so it is not a provider credential
  and `owlie auth` does not store it.
- **XML safety.** Same rules as ADR 0009: no entity processing by the parser,
  and DTDs refused. NCBI responses always start with one external
  `<!DOCTYPE … PUBLIC "…" "…">` line, which loads nothing; only that exact
  form is removed before the check. Any internal subset or entity
  declaration is refused.

## Consequences

- `owlie extract https://pubmed.ncbi.nlm.nih.gov/<pmid>/` returns the PMC
  full text when it is open, else the abstract. `owlie list` and
  `owlie extract` on a search URL return the newest matching articles.
- One article takes two requests (PubMed, then PMC), three from a PMC URL.
- Out of scope: Europe PMC as its own source, MeSH browsing, related articles
  and citation links (`elink`), bulk downloads, ClinicalTrials.gov, and the
  DOI → PMC route (parked with the DOI resolver).
