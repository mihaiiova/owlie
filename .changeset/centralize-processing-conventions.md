---
'owlie': patch
---

Centralize provider-neutral LLM processing conventions in `@owlieio/core`.
The OpenAI and DeepSeek processors now share one core implementation for prompt
rendering, token-usage normalization, output-format selection, result shaping,
and cancellation/error mapping, keeping `{ provider, model, usage }` result
metadata and output conventions identical across functional providers. No
observable CLI behavior changes.
