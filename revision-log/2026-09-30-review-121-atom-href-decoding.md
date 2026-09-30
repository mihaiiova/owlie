# Review: fix #121 (Atom link hrefs not entity-decoded)

**Date:** 2026-09-30
**Session:** Reviewed `fix/121-atom-href-decoding` against `development`. `atomLink()` now reads `href` through the shared decoding `attribute()` helper, so Atom entry, `self`, and `alternate` links are decoded. `pnpm check` passes.

## History Checked

- 2026-09-30-review-119-discovered-feed-urls.md
- 2026-09-30-spec-review-116-feed-listing-metadata.md

## Findings

- The same defect existed in HTML feed discovery: `linkAttributes()` returned raw attribute values, so `<link href="/?feed=rss2&amp;cat=1">` was discovered with a literal `&amp;`. Fixed in the same change, since it is the same class of bug and also yields wrong URLs.
- Identity impact, as the issue anticipated: Atom entries without `<id>` (non-conforming; Atom requires one) whose link contains an entity get a corrected, different link-based entry id once. Chosen: accept the one-time change and state it in the changeset, rather than emitting both ids for a release. The effect is limited to non-conforming feeds, and the old ids pointed at wrong URLs.
- Discovered feed URLs containing an entity also change to their correct form, which changes that feed's collection id (`rss:feed:<url>`) once for such sites.

## Scores

| Dimension          | Score |
| ------------------ | ----- |
| Friction           | 0.1   |
| Repetition         | 0.4   |
| Missing capability | 0.1   |
| Knowledge gap      | 0.2   |
| Fragility          | 0.3   |

## Suggestions

| #   | Category | Suggestion                                                                                                        | Score | Accepted? |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------- | ----- | --------- |
| 1   | testing  | Attribute decoding was missed in three places; a real-world feed fixture corpus would catch it (see #116 review). | 0.5   | Pending   |

## Changes Made

- Also decoded declared feed-link hrefs in HTML discovery.
