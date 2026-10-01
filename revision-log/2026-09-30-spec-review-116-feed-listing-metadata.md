# Review: spec-review of #116 (feed metadata, typed enclosures, entry id source)

**Date:** 2026-09-30
**Session:** Reviewed `spec/116-feed-listing-metadata` against `development`. `owlie list --json` now returns feed metadata on the collection and an allowlisted metadata object per entry (entry id and its source, typed enclosures, separate `media`, deprecated `enclosureUrl`); feed batches carry the same facts as `metadata.feedEntry`. `pnpm check` passes (1008+ tests). A live check on the NPR Planet Money podcast feed returned `guid` ids with `audio/mpeg` enclosures and byte lengths, and on The Verge (Atom) returned `atom-id` ids with the feed title, site link, and image.

## History Checked

- 2026-09-30-spec-review-115-youtube-embed-urls.md
- 2026-09-30-spec-review-114-extraction-proxy.md
- 2026-09-21-spec-review-110-bounded-feed-discovery.md

## Spec Coverage

| Decision                                                           | Status                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Collection `title`, `description`, `siteUrl`, `imageUrl`, `format` | Done (Atom keeps `subtitle`)                                           |
| Typed `enclosures`; `media` separate                               | Done (RSS `<enclosure>`, Atom `link rel="enclosure"`, `media:content`) |
| `enclosureUrl` kept, deprecated                                    | Done (documented in `output-formats.md`)                               |
| `entryIdSource`; ids unchanged                                     | Done (existing id tests pass unchanged)                                |
| Raw entry link, no tracking-parameter removal                      | Confirmed and documented                                               |
| Batch documents carry entry metadata                               | Done as `metadata.feedEntry` (namespaced, see Findings)                |
| Docs, changeset (minor), schema version stays 1                    | Done                                                                   |

## Findings

- Entry metadata was being dropped before it reached any output: `entryToItem` discarded the parsed entry metadata, and `list` item summaries had no `metadata` field at all, so even the existing `enclosureUrl` never appeared. Both fixed; the summary uses an allowlist (`LISTED_ITEM_METADATA_KEYS`) so feed HTML (`content`, raw `description`) and internal fields (`feedUrl`) never reach stdout.
- The spec said to carry entry metadata into documents' `metadata`. It is namespaced under `metadata.feedEntry` so feed facts cannot collide with the extracted document's own metadata (for example an article or YouTube `language`).
- The live check found that attribute URLs were not entity-decoded (the parser runs with entity processing off as an XXE safeguard): The Verge's image URL came through with a literal `&amp;`. Fixed for every URL this spec exposes (enclosures, `media`, `itunes:image`, Atom icon/logo). The same defect in Atom entry `link href` changes entry URLs and, for Atom entries without `<id>`, entry ids, so it is filed separately as #121 instead of changing identities here.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.3   |
| Repetition         | 0.3   |
| Missing capability | 0.3   |
| Knowledge gap      | 0.3   |
| Fragility          | 0.4   |

## Suggestions

| #   | Category   | Suggestion                                                                                             | Score | Accepted? |
| --- | ---------- | ------------------------------------------------------------------------------------------------------ | ----- | --------- |
| 1   | capability | Fix #121 together with #119 before the release that owlie-app #220 depends on.                         | 0.7   | Pending   |
| 2   | testing    | Add a small corpus of real-world feed fixtures (podcast, Atom news, WordPress) to catch decoding gaps. | 0.5   | Pending   |

## Changes Made

- Entity-decoded enclosure, media, and image URLs (found during the live check).
