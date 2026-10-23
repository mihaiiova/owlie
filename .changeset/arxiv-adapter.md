---
'@owlieio/owlie': minor
---

Read arXiv. `owlie extract` on an arXiv paper URL (`/abs/`, `/pdf/` or `/html/`, old or new IDs) returns one `arxiv` document. It starts with the title, the authors and the abstract from the arXiv API, then the paper: the HTML render with formulas kept as LaTeX, or the PDF when there is no render, or the abstract alone (`ARXIV_ABSTRACT_ONLY`). `--abstract-only` reads metadata only. `owlie list` and `owlie extract` read arXiv category feeds (`rss.arxiv.org/rss/cs.CL`, `arxiv.org/list/cs.CL`) and API searches (`export.arxiv.org/api/query?search_query=…`), with version-less `arxiv:<id>` identities. Replacements of older papers are skipped unless `--include-replacements` is given. API requests are spaced three seconds apart, and listings are capped at 200.
