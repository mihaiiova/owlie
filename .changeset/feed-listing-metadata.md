---
'@owlieio/owlie': minor
---

`owlie list --json` now returns the feed's title, description, site link, and
image, and each entry's `metadata`: the entry id and where it came from
(`entryIdSource`), typed `enclosures` (`url`, `type`, `length`), and
`media:content` as a separate `media` list. `enclosureUrl` is kept but
deprecated. Feed batches from `extract` and `process --each` carry the same
entry metadata on each document as `metadata.feedEntry`. Entry ids are
unchanged.
Enclosure, media, and feed image URLs are now entity-decoded (a `&amp;` in a
query string previously came through literally).
