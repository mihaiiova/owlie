---
'@owlieio/owlie': patch
---

`owlie doctor` now reports each provider's effective model id (for example
`deepseek-chat`) instead of a bare `set`/`not set`, and resolves the API key and
model from `.env`/`.env.local` as well as the process environment and the saved
profile — matching `owlie process` precedence. `owlie setup` now notes when a
provider API key is already saved (press Enter to keep it). The API key value
itself is never printed.
