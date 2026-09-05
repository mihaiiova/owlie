---
'owlie': minor
---

Add a functional OpenAI `ContentProcessor` and explicit, provider-first
selection for `owlie process` (`--provider`, `OWLIE_PROVIDER`, or the saved
active provider), provider-keyed saved profiles, live model discovery in
`owlie setup`, per-provider `owlie doctor` reporting, and a shared
`{ provider, model, usage }` result-metadata convention.
