---
'@owlieio/owlie': minor
---

Read PDFs. `owlie extract` and `owlie process` read PDF links (a `.pdf` path, a declared `application/pdf` body, or any body that starts with `%PDF-`) and local PDF files as text documents. Running headers, footers and page numbers are dropped, and words hyphenated across lines are joined. PDF documents are articles with `metadata.format: "pdf"`, `pageCount` and `pagesRead`, plus title, author and creation date from the file. Downloads are capped at 25 MB and reading at 300 pages; longer PDFs carry the `PDF_TRUNCATED_PAGES` warning. Encrypted and scanned (text-less) PDFs fail with a clear error. `owlie capabilities` now reports `documentFormats: ["html", "pdf"]`.
