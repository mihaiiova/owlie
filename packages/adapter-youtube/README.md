# @owlieio/adapter-youtube

YouTube source adapter for Owlie CLI.

This scaffold implements pure URL recognition for YouTube playlists and videos
and defines the adapter surface. It makes no network calls: `list` and `extract`
throw `NotImplementedError` until real extraction lands.

## What is implemented

- `recognizeYouTubeUrl` — detects `youtube.com` / `youtu.be` URLs.
- `isPlaylistUrl` / `isVideoUrl` — distinguishes playlists from videos.
- `YouTubeAdapter` — implements `CollectionAdapter` (playlists) and
  `ItemAdapter` (videos); recognition and resolution are pure.

## Dependency rules

May depend only on `@owlieio/core`. No providers, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
