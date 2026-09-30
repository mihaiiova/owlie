# @owlieio/adapter-podcast

Podcast episode source adapter for Owlie CLI.

The adapter recognizes direct podcast media URLs, Apple Podcasts episode URLs,
and safe server-rendered episode pages with declarative audio metadata. It resolves pages through an injected
safe HTTP fetcher, downloads the resulting media through its safe binary seam,
and delegates transcription to an injected `Transcriber` (for example
`@owlieio/provider-whisper`). It owns no source-specific network client.

## What is implemented

- `recognizePodcastUrl` — detects direct MP3, M4A, AAC, OGG, Opus, WAV, and
  FLAC URLs.
- `DirectMediaResolver` / `PodcastAudioResolver` — the resolver seam for
  podcast media URLs.
- `ApplePodcastsResolver` — resolves Apple episode URLs through the public iTunes
  lookup API, with a matching RSS enclosure fallback.
- `GenericEpisodePageResolver` — resolves audio signals without rendering
  JavaScript. Strong signals (JSON-LD `PodcastEpisode`/`AudioObject`/
  `MusicRecording` with a media URL, or an oEmbed resolving to audio) always
  win. Weak signals (`<audio>`, `<source>` in `<audio>` or audio-typed, audio
  enclosures, the page's own feed-entry enclosure) are used only when the page
  does not declare an article, unless `resolve` is called with
  `{ authoritative: true }` (ADR 0037). A declared article defers with
  `NotHandledError`, carrying the fetched page for the article adapter.
- `PodcastAdapter` — implements `ItemAdapter`; it downloads a bounded media
  file, delegates to a `Transcriber`, and cleans its temporary cache directory.

## Dependency rules

May depend on `@owlieio/core` and the public RSS parser from
`@owlieio/adapter-rss` solely to select the matching episode's enclosure from
a feed (the Apple and episode-page fallbacks). No providers,
no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
