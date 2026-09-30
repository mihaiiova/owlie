---
'@owlieio/owlie': patch
---

Podcast episode-page resolution now accepts only audio: a `<video>` source,
image, or non-audio enclosure on a page is no longer downloaded and
transcribed as an episode, and the feed fallback uses only the feed entry
whose link is the requested page instead of the feed's first enclosure. An
ordinary homepage or article on a site with a podcast feed is therefore no
longer transcribed as an unrelated episode. A download or page fetch aborted
by `--timeout-ms` or cancellation no longer crashes the process with an
unhandled `AbortError`; it ends with the cancellation record and exit code 130.
