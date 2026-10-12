---
'@owlieio/owlie': patch
---

Article text keeps its structure: paragraphs, headings and other blocks are separated by a blank line, list items, table rows and line breaks start a new line, and `<pre>` lines are kept as they are. Escaped text such as `&lt;div&gt;` in code samples now survives as literal `<div>` instead of being dropped. Because article `text` changes, `provenance.contentFingerprint` for the same article changes once with this release (#136).
