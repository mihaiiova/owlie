# @owlieio/adapter-youtube

YouTube source adapter for Owlie CLI.

Implements pure, network-free URL recognition, canonicalization, and stable
identity for **individual YouTube videos**, plus transcript extraction via the
pure-JS [`@hallelx/youtube-transcript`](https://www.npmjs.com/package/@hallelx/youtube-transcript)
library (no Python required). `list` (playlists) throws `NotImplementedError` —
collections are out of v0.1 scope.

## What is implemented

- `recognizeYouTubeUrl` / `extractVideoId` / `canonicalizeVideoUrl` /
  `isVideoUrl` / `isPlaylistUrl` — pure URL logic.
- `pickTranscript` — the transcript selection policy.
- `YouTubeTranscriptClient` / `LibraryTranscriptSource` — fetches transcripts
  via `@hallelx/youtube-transcript`.
- `YouTubeAdapter.extract` — returns a `NormalizedDocument`
  (`mediaType: 'transcript'`) with `videoId`, `language`, `languageCode`, and
  `isGenerated` metadata (no title).

## Supported video URLs (v0.1)

```text
https://www.youtube.com/watch?v=<id>
https://m.youtube.com/watch?v=<id>
https://music.youtube.com/watch?v=<id>
https://youtu.be/<id>
```

Video IDs are exactly 11 characters from `[A-Za-z0-9_-]`. Every supported form
canonicalizes to `https://www.youtube.com/watch?v=<id>` and resolves to the
stable identity `youtube:video:<id>`.

Unsupported in v0.1 (rejected with a clear error): playlists, channels,
search URLs, and `/shorts/`, `/live/`, `/embed/`, and `/v/` forms.

## Language selection

Default languages: `['en']`. Pass `languages` to the adapter (or `--language`
on the CLI) as a priority list, e.g. `['de', 'en']`. The selection policy is:

1. manually created tracks matching the requested languages (priority order);
2. generated tracks matching the requested languages;
3. the first manually created track (any language);
4. the first generated track (any language).

Translation is never performed.

## Typed failures

- `CaptionsUnavailableError` — no captions/transcript for the video.
- `CancelledError` — abort signal or timeout.
- `ExtractionError` — any other failure (network, blocked, malformed response).

## Dependency rules

May depend only on `@owlieio/core` (plus the `@hallelx/youtube-transcript`
library). No providers, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
