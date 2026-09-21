---
'owlie': minor
---

Add bounded, one-hop RSS/Atom feed discovery from supplied HTML pages. `owlie
list`, `owlie extract`, and `owlie process --each` now accept an HTML page URL
that exposes a feed (via a `<link rel="alternate">` element or a conventional
feed path) in addition to a direct feed URL; discovery fetches only the
supplied page with a constrained tokenizer and never executes JavaScript or
follows links recursively. On `owlie extract`, a page URL with no discoverable
feed is a clear discovery error rather than silent article extraction; static
article extraction remains available through `owlie process URL` and
linked-item feed extraction.
