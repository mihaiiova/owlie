---
'@owlieio/owlie': patch
---

`owlie extract` and `owlie process` now show loading status without the `owlie:` prefix: the article-extraction fallback prints `extracting article text`, and `owlie process` shows a `waiting for llm response` spinner while the LLM responds. Status lines now animate only when stderr is a terminal; redirected or piped output gets clean plain lines instead of carriage-return spinner frames.
