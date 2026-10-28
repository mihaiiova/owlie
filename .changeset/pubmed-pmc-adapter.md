---
'@owlieio/owlie': minor
---

Read PubMed articles and follow PubMed searches (ADR 0042). A PubMed, PMC or Europe PMC article URL is extracted with source type `pubmed` and identity `pubmed:<pmid>` (a PMC URL resolves to its PMID): metadata from PubMed (authors, journal, structured abstract, MeSH headings, publication types, DOI, PMCID), then the open PubMed Central full text converted from JATS (sections, captions, formulas as LaTeX, no references), else the abstract (`PUBMED_ABSTRACT_ONLY`). Retracted articles carry `PUBMED_RETRACTED`. `owlie list` and `owlie extract` on a search URL (`pubmed.ncbi.nlm.nih.gov/?term=…`, common filters translated) return the newest matching articles, at most 200. New `--contact-email` / `OWLIE_CONTACT_EMAIL` and `--ncbi-api-key` / `OWLIE_NCBI_API_KEY` identify requests to NCBI; requests are spaced to three a second, or ten with a key.
