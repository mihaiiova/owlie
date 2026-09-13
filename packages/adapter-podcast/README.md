# @owlieio/adapter-podcast

Podcast episode source adapter for Owlie CLI.

The adapter recognizes direct podcast media URLs and safe server-rendered episode
pages with declarative audio metadata. It resolves pages through an injected
safe HTTP fetcher, downloads the resulting media through its safe binary seam,
and delegates transcription to an injected `Transcriber` (for example
`@owlieio/provider-whisper`). It owns no source-specific network client.

## What is implemented

- `recognizePodcastUrl` — detects direct MP3, M4A, AAC, OGG, Opus, WAV, and
  FLAC URLs.
- `DirectMediaResolver` / `PodcastAudioResolver` — the resolver seam for
  podcast media URLs.
- `GenericEpisodePageResolver` — resolves JSON-LD, oEmbed, `<audio>`/`<source>`,
  and RSS/Atom enclosure signals without rendering JavaScript.
- `PodcastAdapter` — implements `ItemAdapter`; it downloads a bounded media
  file, delegates to a `Transcriber`, and cleans its temporary cache directory.

## Dependency rules

May depend only on `@owlieio/core`. No providers, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
