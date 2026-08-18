# @owlieio/adapter-podcast

Podcast episode source adapter for Owlie CLI.

This scaffold recognizes podcast media URLs and defines the item-adapter
surface. Transcription is delegated to a `Transcriber` (for example
`@owlieio/provider-whisper`) and is not implemented here. No network calls are
made.

## What is implemented

- `recognizePodcastUrl` — detects common audio/video file URLs.
- `PodcastAdapter` — implements `ItemAdapter`; recognition and resolution are
  pure, `extract` throws `NotImplementedError`.

## Dependency rules

May depend only on `@owlieio/core`. No providers, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
