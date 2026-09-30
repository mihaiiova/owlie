---
'@owlieio/owlie': patch
---

Atom link URLs and feed links declared in HTML pages are now entity-decoded,
so a `&amp;` in a query string no longer reaches the request literally. Entry
URLs, feed URLs, and site links containing entities change to their correct
form. For the rare Atom entry that has no `<id>` and whose link contains an
entity, the entry id (taken from the link) changes once; consumers that store
entry ids may see such an entry as new one time.
