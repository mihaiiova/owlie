# @owlieio/owlie

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
