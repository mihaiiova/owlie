---
'owlie': minor
---

Add BYOK credential management (`owlie auth add|list|remove <provider>`) over the
existing user-level credential store, dynamic model discovery
(`owlie models [--provider <provider>] [--refresh]`) through a new
provider-neutral `ProviderCatalog` contract in `@owlieio/core`, and the
canonical `--model provider/model-id` selection flag for `owlie process` (the
`--provider` flag remains a hidden alias). Model ids are discovered at runtime
from each provider (no hardcoded allowlist) and cached for one hour with a
cache-on-failure fallback. `owlie setup` and `owlie doctor` now share the
catalog and report the effective credential source without echoing secrets.
