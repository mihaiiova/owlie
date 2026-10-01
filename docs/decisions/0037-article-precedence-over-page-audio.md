# ADR 0037 — Declared article pages win over embedded audio players

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

`owlie extract <page URL>` runs podcast episode-page resolution (ADR 0019)
before article classification (ADR 0035). After #120 the resolver accepts only
audio, but it still treated any `<audio>` element, audio enclosure, or matching
feed-entry enclosure as proof that the page is an episode. An article with an
embedded player ("listen to this article", a clip, an interview excerpt) was
therefore downloaded and transcribed instead of extracted as text. A
general-purpose web content extractor (ADR 0034) should follow the page's own
declaration of what it is.

## Decision

- **Strong signals** always resolve an episode: JSON-LD `PodcastEpisode`,
  `AudioObject`, or `MusicRecording` with a media URL, or a declared oEmbed
  whose media URL is audio (`type: "audio"`, or an audio extension). A
  `video` or other non-audio oEmbed is ignored.
- **Weak signals** resolve an episode only when the page does not declare an
  article: `<audio src>`, `<source>` inside `<audio>` or with an audio type, an
  audio `<enclosure>`/`link rel="enclosure"`, and the page's own feed-entry
  audio enclosure.
- **Article declaration** is `og:type` `article` or a JSON-LD article type, the
  rules of ADR 0035. The check moves to `@owlieio/core`
  (`declaredArticleSignal`) so the article adapter and the podcast resolver
  agree; `adapter-article` re-exports it.
- A declared article with only weak signals makes the resolver throw
  `NotHandledError` with the fetched page as `deferredResponse`, so the article
  adapter classifies and extracts the same response without refetching. The
  article carries no `ARTICLE_FALLBACK` warning.
- Pages that declare nothing keep ADR 0019 behaviour, so episode pages whose
  only signal is a player still resolve.
- Explicit resolver selection (`--podcast-page`, `owlie resolve --podcast-page`)
  is authoritative: `PodcastAudioResolver.resolve` receives
  `{ authoritative: true }`, and weak signals resolve even on a declared
  article.

## Consequences

- A declared article with an embedded clip now yields article text instead of
  a transcript. Callers who want the clip pass `--podcast-page`.
- A page that declares an article but is really an episode page without
  structured audio data is extracted as text; `--podcast-page` covers it.
- `owlie resolve` without a flag on such a page fails with "declares an
  article" instead of returning the clip.
