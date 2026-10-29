---
'@owlieio/owlie': minor
---

Read bioRxiv and medRxiv preprints and follow their subjects (ADR 0041). A preprint URL (`biorxiv.org/content/<doi>`, `medrxiv.org/…`) is extracted as one paper with source type `biorxiv` and a version-less `biorxiv:<doi>` identity: metadata from `api.biorxiv.org`, then the full-text page's body sections, else the PDF, else the abstract (`BIORXIV_ABSTRACT_ONLY`). `owlie list` and `owlie extract` on a subject (`biorxiv.org/collection/neuroscience`) or a whole server (`/collection`) return the preprints posted in the last 14 days, newest first, at most 200, with revisions skipped unless `--include-replacements`. `--abstract-only` works for preprints too. Requests are spaced per process (one API request a second, one page every two seconds), and an HTTP 429 is retried once after `Retry-After`. HTTP status errors now carry `details.httpStatus` (and `retryAfterSeconds`) in JSON error records.
