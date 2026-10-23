---
'@owlieio/owlie': patch
---

Articles keep text inside custom elements (tag names with a hyphen, such as Google's `<uni-article-paragraph>`), which the sanitizer used to drop with their content, failing pages like blog.google posts with `no readable static article content`. When sanitizing still removes the text of a declared article, the text Readability found is used, with the `article_text_recovered` warning. An article with no text now fails with a code that says why: `ARTICLE_NO_READABLE_TEXT`, `ARTICLE_TEXT_DROPPED` or `ARTICLE_TOO_SHORT` (the message is unchanged), and JSON error records may carry `details` with counts such as `readableChars` and `sanitizedChars`. **Consumers that matched `EXTRACTION_ERROR` for empty articles must also accept the three new codes** (#172).
