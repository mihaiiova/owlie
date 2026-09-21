---
'owlie': minor
---

Add first-class extraction provenance and a credential-free artifact
capabilities manifest. `NormalizedDocument.schemaVersion` is now `2` and every
document carries `provenance` (`sourceId`, `canonicalUrl`, `adapterId`, optional
`resolverId`, CLI-boundary `fetchedAt`, optional `language`, SHA-256
`contentFingerprint`, and structured `warnings`), preserved through JSON and
feed/each round trips. New `owlie capabilities [--json]` reports the artifact
and schema versions plus the command/adapter/provider/resolver catalogs, and
`owlie --version --json` now emits the versioned protocol envelope.
