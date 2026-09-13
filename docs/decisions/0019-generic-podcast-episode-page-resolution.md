# ADR 0019 — Generic podcast episode-page audio resolution

- **Status:** Accepted
- **Date:** 2026-09-12
- **Supersedes:** the episode-page deferral in [ADR 0018](0018-local-podcast-transcription.md)

## Context

Podcast listeners commonly have an episode-page URL rather than a direct media
URL. Treating those pages as articles returns unrelated prose instead of the
audio transcript. The direct-media pipeline in ADR 0018 already provides safe,
bounded downloads and local transcription, but needs a source-neutral way to
resolve a page to its declared audio enclosure.

## Decision

- Add `GenericEpisodePageResolver` behind the existing `PodcastAudioResolver`
  seam.
- For safe HTTP(S) URLs that are not direct media, fetch bounded page text using
  core's injectable `HttpFetcher`; all linked oEmbed and feed requests use the
  same seam and policy.
- Resolve declarative signals in this order: JSON-LD `AudioObject`,
  `PodcastEpisode`, or `MusicRecording`; declared JSON oEmbed; `<audio>` or
  `<source>`; then RSS/Atom enclosure links. Resolve relative URLs against their
  source and validate the final media URL with `assertSafeHttpUrl`.
- Return the media URL and `{ resolvedFrom: 'page', title? }`, then retain the
  existing bounded download and transcription path unchanged.
- Do not execute JavaScript, render pages, scrape arbitrary prose, or add
  provider-specific resolution. A page without a declarative audio signal defers
  to the article adapter: the resolver throws `NotHandledError`, and dispatch
  falls back with a stderr diagnostic.

## Consequences

Generic server-rendered episode pages work in `owlie extract` wherever the
publisher exposes one of the documented declarative signals; static article
extraction remains the fallback for safe pages without a declarative audio
enclosure. JavaScript-only players, Apple/Spotify and other provider-specific
APIs, podcast feed discovery, and listing remain out of scope. ADR 0018's
direct-media download and local transcription decisions remain in force.
