# @owlieio/owlie

## 0.9.1

### Patch Changes

- d316218: Articles keep text inside custom elements (tag names with a hyphen, such as Google's `<uni-article-paragraph>`), which the sanitizer used to drop with their content, failing pages like blog.google posts with `no readable static article content`. When sanitizing still removes the text of a declared article, the text Readability found is used, with the `article_text_recovered` warning. An article with no text now fails with a code that says why: `ARTICLE_NO_READABLE_TEXT`, `ARTICLE_TEXT_DROPPED` or `ARTICLE_TOO_SHORT` (the message is unchanged), and JSON error records may carry `details` with counts such as `readableChars` and `sanitizedChars`. **Consumers that matched `EXTRACTION_ERROR` for empty articles must also accept the three new codes** (#172).

## 0.9.0

### Minor Changes

- 049796d: Read arXiv. `owlie extract` on an arXiv paper URL (`/abs/`, `/pdf/` or `/html/`, old or new IDs) returns one `arxiv` document. It starts with the title, the authors and the abstract from the arXiv API, then the paper: the HTML render with formulas kept as LaTeX, or the PDF when there is no render, or the abstract alone (`ARXIV_ABSTRACT_ONLY`). `--abstract-only` reads metadata only. `owlie list` and `owlie extract` read arXiv category feeds (`rss.arxiv.org/rss/cs.CL`, `arxiv.org/list/cs.CL`) and API searches (`export.arxiv.org/api/query?search_query=…`), with version-less `arxiv:<id>` identities. Replacements of older papers are skipped unless `--include-replacements` is given. API requests are spaced three seconds apart, and listings are capped at 200.
- aceab29: Read PDFs. `owlie extract` and `owlie process` read PDF links (a `.pdf` path, a declared `application/pdf` body, or any body that starts with `%PDF-`) and local PDF files as text documents. Running headers, footers and page numbers are dropped, and words hyphenated across lines are joined. PDF documents are articles with `metadata.format: "pdf"`, `pageCount` and `pagesRead`, plus title, author and creation date from the file. Downloads are capped at 25 MB and reading at 300 pages; longer PDFs carry the `PDF_TRUNCATED_PAGES` warning. Encrypted and scanned (text-less) PDFs fail with a clear error. `owlie capabilities` now reports `documentFormats: ["html", "pdf"]`.

## 0.8.0

### Minor Changes

- 9f7d564: Apple Podcasts show URLs (`https://podcasts.apple.com/<cc>/podcast/<slug>/id<digits>`, no `?i=` episode id) now work with `owlie list` and `owlie extract`. They resolve to the show's RSS feed through Apple's public lookup, then behave exactly like the feed URL. The collection gains `metadata.apple: { podcastId, showUrl }`. A show without a public feed fails with `EXTRACTION_ERROR`, and `--article` with a show URL is a usage error (#153).
- 3e028ed: Feed listings stop downloading once they have the entries `--limit` asks for, so listing a few episodes of a very large podcast feed reads a small prefix instead of the whole file (and counts only that against `--max-network-bytes` and `--max-feed-bytes`). New `--order feed|newest` on `list`, `extract` feed batches and `process --each`: `newest` reads the whole feed and sorts entries by publication date, undated entries last; `feed` (the default) keeps document order. Library consumers get `HttpFetchOptions.stopReading` and `CollectionListOptions.sort: 'feed' | 'newest'` on `RssAdapter`.
- c0a627c: Feed responses get their own 32 MiB size limit, so podcast feeds with long back catalogues (700+ episodes) can be listed and extracted instead of failing at 5 MiB. The limit applies to any response with an RSS, Atom or XML media type (not XHTML): listing, feed batches, discovery probes and the Apple and episode-page feed fallbacks. HTML pages keep 5 MiB. The new `--max-feed-bytes N` flag changes it; `--max-network-bytes` still caps the invocation total. Library consumers can set `HttpFetchPolicy.maxFeedResponseBytes` (#122).
- 09af775: Feed entries expose Podcasting 2.0 `<podcast:transcript>` links as `metadata.transcripts: [{ url, type?, language?, rel? }]` in `owlie list --json`, `extract` feed batches and `process --each`, so consumers can use a publisher's transcript instead of transcribing the audio. Only absolute `http(s)` links are kept, and they are not fetched (#143).

### Patch Changes

- ca09151: Dependency updates: the AI SDK packages, `undici` and `fast-xml-parser`.
- e9744ca: `owlie setup` and `owlie auth add` prompts now end at the `--timeout-ms` deadline or on Ctrl-C (exit 130), and an answer that arrives after cancellation is never saved. `owlie auth` failures such as a read-only config directory or a full disk are reported as JSON error records in `--json` mode instead of raw text (#126).
- 01b9771: The progress spinner clears the rest of its line on every frame, so a shorter status such as `waiting for llm response` no longer leaves characters from a longer previous one (for example a YouTube video id) on screen.
- 878578e: YouTube videos with transcripts disabled, or with no transcript at all, now fail with `CAPTIONS_UNAVAILABLE` instead of `EXTRACTION_ERROR`, so consumers can tell "this video has no captions" from a fetch failure without matching on the message. Blocked requests, unavailable videos and network failures stay `EXTRACTION_ERROR` (#129).

## 0.7.1

### Patch Changes

- ee5b243: Article text keeps its structure: paragraphs, headings and other blocks are separated by a blank line, list items, table rows and line breaks start a new line, and `<pre>` lines are kept as they are. Escaped text such as `&lt;div&gt;` in code samples now survives as literal `<div>` instead of being dropped. Because article `text` changes, `provenance.contentFingerprint` for the same article changes once with this release (#136).

## 0.7.0

### Minor Changes

- 22cf328: Hacker News support (ADR 0038). `owlie list` reads the front page, newest, best,
  Ask HN, Show HN and a user's submissions through the official HN API, with
  each story's HN id, kind, score, comment count and linked URL. `owlie extract`
  on an item URL returns its discussion (the post and a bounded comment tree),
  its linked article, or both in one document with `--hn-content`, and
  `--max-comments`, `--comment-depth` and `--max-top-level-comments` bound the
  comments. Adds the `hackernews` source type: consumers that check the
  source-type enum must accept it. `news.ycombinator.com/rss` stays an RSS feed.

### Patch Changes

- 62e426c: `--hn-content` and the Hacker News comment-bound flags are a usage error with a
  resolver flag (such as `--podcast-apple`) instead of being silently ignored.

## 0.6.0

### Minor Changes

- Require Node.js 22 or later (was 20, which reached end of life in April
  2026). The published package now declares `engines.node: ">=22"`.
- a75f266: A page that declares itself an article (`og:type` article or a JSON-LD article
  type) is now extracted as article text even when it embeds an audio player.
  Only structured podcast data (JSON-LD `PodcastEpisode`/`AudioObject`, or an
  oEmbed resolving to audio) makes such a page an episode. `--podcast-page` still
  forces the episode path. A `video` oEmbed is no longer treated as episode audio.
- b015cf8: `owlie extract <page URL>` now returns the article when the page is one (it
  declares `og:type` article or a JSON-LD article type, or has a long readable
  body), instead of discovering the site's feed. Other pages still go to feed
  discovery, reusing the same fetch. New `--article` and `--feed` flags force
  either path. Article pages no longer carry an `ARTICLE_FALLBACK` warning.
- 5746324: A proxy now carries all extraction traffic (article pages, feeds, podcast
  pages, Apple lookups, media downloads, and YouTube), not only YouTube
  transcripts. Set it with `OWLIE_PROXY_URL` (`http`, `https`, or `socks5`) or
  `OWLIE_WEBSHARE_PROXY_USERNAME`/`OWLIE_WEBSHARE_PROXY_PASSWORD`, which also
  work in `--hosted` mode. A proxy saved by `owlie setup` applies the same way.
  `owlie doctor` reports the proxy mode and source. LLM provider calls stay
  direct.
- f9d4c79: `owlie list --json` now returns the feed's title, description, site link, and
  image, and each entry's `metadata`: the entry id and where it came from
  (`entryIdSource`), typed `enclosures` (`url`, `type`, `length`), and
  `media:content` as a separate `media` list. `enclosureUrl` is kept but
  deprecated. Feed batches from `extract` and `process --each` carry the same
  entry metadata on each document as `metadata.feedEntry`. Entry ids are
  unchanged.
  Enclosure, media, and feed image URLs are now entity-decoded (a `&amp;` in a
  query string previously came through literally).
- e60ca9d: YouTube `/embed/<id>` and `/v/<id>` URLs are now extracted like `watch?v=<id>`
  URLs and share the same identity. YouTube live-stream (`/live/`) and Shorts
  (`/shorts/`) URLs now fail with a clear `VALIDATION_ERROR`.
  The message for a blocked transcript request now names the proxy environment
  variables, which also work in `--hosted` mode.

### Patch Changes

- `--max-network-bytes` is exhausted by the first response that crosses it, so
  feed discovery probes and later batch items cannot keep downloading past the
  cap. A deadline or cancellation during an episode page's oEmbed or feed
  lookup ends with the cancellation record. `owlie auth list --env-file FILE`
  reports keys from that file.
- 8a56547: Atom link URLs and feed links declared in HTML pages are now entity-decoded,
  so a `&amp;` in a query string no longer reaches the request literally. Entry
  URLs, feed URLs, and site links containing entities change to their correct
  form. For the rare Atom entry that has no `<id>` and whose link contains an
  entity, the entry id (taken from the link) changes once; consumers that store
  entry ids may see such an entry as new one time.
- b917bcd: Feeds at URLs that do not look like feeds now work. A feed found by discovery
  (for example `/atom/everything/`) is listed instead of being rejected as "not a
  recognized RSS/Atom feed URL", and a URL that itself serves an RSS/Atom feed
  (for example `/?feed=rss2` or `https://hnrss.org/frontpage`) is listed or
  extracted directly instead of failing discovery.
- 7ae7fb6: Describe Owlie as a general-purpose web content extractor. The `owlie --help`
  heading and the package description and keywords now say so, and the
  documentation describes any product that runs Owlie as a subprocess as a
  consumer of the same public contract (ADR 0034). No behaviour changes.
- bb472a1: Podcast episode-page resolution now accepts only audio: a `<video>` source,
  image, or non-audio enclosure on a page is no longer downloaded and
  transcribed as an episode, and the feed fallback uses only the feed entry
  whose link is the requested page instead of the feed's first enclosure. An
  ordinary homepage or article on a site with a podcast feed is therefore no
  longer transcribed as an unrelated episode. A download or page fetch aborted
  by `--timeout-ms` or cancellation no longer crashes the process with an
  unhandled `AbortError`; it ends with the cancellation record and exit code 130.

## 0.5.1

### Patch Changes

- Fix batch spinner/progress reporting so `owlie process FEED --each` and
  `owlie extract FEED` stay consistent with single-item paths: the spinner now
  switches to `waiting for llm response` before each item's LLM call, per-item
  `progress` events (e.g. whisper transcription progress) reach the spinner,
  and batch extraction messages carry a `[i/N]` position so progress through
  the bounded limit is visible.

## 0.5.0

### Major Changes

- `--json` now uses the versioned subprocess protocol: single-result commands
  emit `{ schemaVersion, command, result }`; streaming commands emit JSONL;
  and stderr emits versioned progress and terminal records.

### Minor Changes

- Add deterministic `--hosted` mode; invocation-wide `--timeout-ms`,
  `--max-network-bytes`, and `--max-stdout-bytes` controls; document
  provenance and `owlie capabilities`; and support bounded RSS/Atom feed
  discovery from a supplied HTML page for `list`, `extract`, and `process
--each`.

## 0.4.0

### Minor Changes

- BYOK credential management (`owlie auth add|list|remove <provider>`), dynamic
  model discovery (`owlie models [--provider <provider>] [--refresh]`) via a
  provider-neutral `ProviderCatalog` contract, and the canonical
  `--model provider/model-id` selection flag for `owlie process` (the
  `--provider` flag remains a hidden alias). Model ids are discovered at
  runtime from each provider (no hardcoded allowlist) and cached for one hour
  with a cache-on-failure fallback. `owlie setup` and `owlie doctor` now share
  the catalog and report the effective credential source without echoing
  secrets.

## 0.3.1

### Patch Changes

- 6c34e78: Fixed Apple Podcasts episode resolution when Apple's `itunes.apple.com/lookup` endpoint serves JSON with a `text/javascript` content type instead of `application/json`. `owlie extract` and `owlie resolve` on Apple Podcasts episode URLs now resolve the episode media URL instead of failing with "unexpected lookup response content type".
- 6c34e78: Error and usage messages no longer carry an `owlie:` prefix and are now color-coded on a TTY (red for errors, yellow for usage warnings, dim for informational fallback notices); piped/redirected output stays plain. Local-transcription failures now name the specific missing prerequisite (`ffprobe`, `ffmpeg`, `python3`, or `faster-whisper`) instead of embedding a Python traceback, and the "no provider selected" message lists the known providers.
- 6c34e78: `owlie extract` and `owlie process` now show loading status without the `owlie:` prefix: the article-extraction fallback prints `extracting article text`, and `owlie process` shows a `waiting for llm response` spinner while the LLM responds. Status lines now animate only when stderr is a terminal; redirected or piped output gets clean plain lines instead of carriage-return spinner frames.

## 0.3.0

### Minor Changes

- 9a9eddf: `owlie process URL --prompt "..."` now extracts a single http(s) URL through the
  universal YouTube/podcast/article rule before processing it, so articles,
  YouTube videos, and podcast episodes can be processed directly without a
  separate `owlie extract` step. Feed URLs still require `--each`.

### Patch Changes

- 9a9eddf: `owlie extract` (and `owlie process URL`) no longer print the podcast-specific
  "no podcast audio enclosure found" diagnostic when a URL falls back to article
  extraction; they now print "extracting article text".
- 5e7001d: `owlie doctor` now reports each provider's effective model id (for example
  `deepseek-chat`) instead of a bare `set`/`not set`, and resolves the API key and
  model from `.env`/`.env.local` as well as the process environment and the saved
  profile — matching `owlie process` precedence. `owlie setup` now notes when a
  provider API key is already saved (press Enter to keep it). The API key value
  itself is never printed.
- e56c12f: Fix `owlie setup` transcription prerequisite detection. Probe `ffmpeg` and
  `ffprobe` with `-version` (their canonical flag) instead of `--version`,
  matching `owlie doctor`. ffmpeg 7.x rejects `--version`, so `owlie setup`
  previously reported ffmpeg/ffprobe as missing even when both were installed.

## 0.2.0

### Minor Changes

- 8ca9ed3: Add Apple Podcasts episode resolution. `owlie extract
<podcasts.apple.com episode url>` now resolves the episode through the public
  iTunes lookup API (matched by episode id) with a matching RSS `<enclosure>`
  fallback, then downloads and transcribes it with the existing local
  faster-whisper pipeline. Resolution requires no Apple credentials and uses the
  safe HTTP seam throughout.
- 403a1dd: Split audio extraction into a resolve stage and a shared transcription stage.
  `owlie extract` gains explicit resolver-selection flags (`--podcast-media`,
  `--podcast-page`, `--podcast-apple`) that assert which resolver finds the audio
  URL, and a new `owlie resolve URL [--<type>-<name>]` command prints the
  validated media URL without transcribing it, for consumers that run their own
  transcription. New audio sources are added as a `PodcastAudioResolver` plus a
  `--<type>-<name>` flag and reuse the generic local faster-whisper pipeline
  unchanged (ADR 0022).
- bc6eb42: Add generic podcast episode-page audio resolution. `owlie extract
<episode-page-url>` now resolves a server-rendered page's declared audio
  enclosure (JSON-LD, oEmbed, `<audio>`/`<source>`, or RSS/Atom enclosure links)
  through the safe HTTP seam, then downloads and transcribes it with the existing
  local faster-whisper pipeline. It never executes JavaScript, and a safe page
  with no declarative audio defers to static article extraction with a stderr
  diagnostic.
- a005488: Add a functional OpenAI `ContentProcessor` and explicit, provider-first
  selection for `owlie process` (`--provider`, `OWLIE_PROVIDER`, or the saved
  active provider), provider-keyed saved profiles, live model discovery in
  `owlie setup`, per-provider `owlie doctor` reporting, and a shared
  `{ provider, model, usage }` result-metadata convention.
- 2fb22cb: Add local direct-media podcast transcription. `owlie extract <audio-url>` now
  downloads a bounded direct podcast media file and transcribes it with local
  faster-whisper (ffmpeg/ffprobe + Python), emitting plain transcript text by
  default or a normalized podcast transcript document with segment timing through
  `--json`. `owlie setup` gains a Transcription section to pick a Whisper model,
  and `owlie doctor` reports transcription readiness. The tools are detected but
  never installed, and the saved model is persisted in the 0600 user config.

### Patch Changes

- ad50916: Normalize static-article publish timestamps to a stable ISO 8601 UTC form.
  `@extractus/article-extractor` changed its published-time formatting across
  releases, so the article adapter now canonicalizes the value the same way the
  RSS adapter does, keeping `publishedAt` output consistent across sources.
- 403a1dd: Extracting an ordinary article no longer fetches the page twice. When the
  generic podcast episode-page resolver defers to static article extraction, the
  already safe-fetched page response is reused by the article adapter, so direct
  `owlie extract` and feed batches make one page request per article instead of
  two.
- 403a1dd: Bound direct-media extraction with end-to-end timeout and download-size CLI limits.
- 403a1dd: Centralize provider-neutral LLM processing conventions in `@owlieio/core`.
  The OpenAI and DeepSeek processors now share one core implementation for prompt
  rendering, token-usage normalization, output-format selection, result shaping,
  and cancellation/error mapping, keeping `{ provider, model, usage }` result
  metadata and output conventions identical across functional providers. No
  observable CLI behavior changes.
- 403a1dd: Consolidate media-type classification and output-format vocabulary into
  `@owlieio/core`. A single shared `mediaTypeOf`/`isHtmlContentType`/
  `isJsonContentType`/`isFeedContentType` module replaces the five package-local
  classifiers across adapters and `owlie setup`; `HttpFetcher` no longer exposes
  the content-type-dropping `fetchText` method; and `ProcessResult.format` gains
  a dedicated `ProcessResultFormat` type distinct from the reserved serializer's
  `OutputFormat`. RSS keeps its documented accept-missing feed content type
  compatibility. No observable CLI behavior changes.
- 403a1dd: Consolidate text and binary safe-HTTP transfers onto a single validated exchange
  loop in core, and clean up partial download files when a binary transfer fails,
  times out, or is cancelled. Text and binary fetches now share one implementation
  point for SSRF checks, redirects, timeouts, cancellation, and error mapping.
- 403a1dd: Validate downloaded direct media with ffprobe and require Whisper models to be pre-provisioned locally.
- 403a1dd: `owlie doctor` now probes ffmpeg and ffprobe with `-version` (their canonical
  flag) instead of `--version`, so transcription readiness is detected correctly
  on ffmpeg 7.x and newer.
- ce837fa: Static article extraction no longer drops article bodies that Readability keeps
  inside a `<main>` (or other semantic) wrapper. The adapter now passes an
  explicit `allowedTags` allowlist to `@extractus/article-extractor`, whose
  sanitizer otherwise removes a disallowed element together with its subtree.
- 403a1dd: Model local CLI input as local content. `owlie process` now represents text
  files and stdin with the `local` source type (`local:stdin` or
  `local:file:<basename>` identities) instead of fabricating an `rss` source
  type, and it rejects JSON input with a malformed or missing `sourceType` rather
  than defaulting it to `rss`.
- 403a1dd: Reconcile CLI documentation with current observable behavior: `--env-file` is
  no longer described as reserved, `process --each` JSONL streaming is no longer
  described as deferred, `OutputSerializer` is documented as a reserved interface
  rather than an implemented serializer, and package/command lists now include
  `owlie setup` and the DeepSeek provider.
- 7817177: Harden safe HTTP fetching by canonically classifying IPv4 and IPv6 destinations,
  rejecting URL credentials, narrowing the private-host opt-in, and removing URL
  query and fragment secrets from diagnostics.
- 403a1dd: Route authenticated provider model discovery and RSS feed fetching through the
  safe HTTP seam. The core fetcher now merges caller-supplied request headers
  (keeping control of its own User-Agent and dropping them on cross-origin
  redirects), `owlie setup` validates model-discovery responses as JSON before
  parsing, and RSS/Atom feeds with a declared incompatible content type are
  rejected before XML parsing.
- a92b29f: Harden SSRF protection in the safe HTTP fetch: hostnames are now resolved to
  their IP address(es) and refused when any resolved address is a private/local
  destination, on every redirect hop (best-effort; the resolver is injectable).
