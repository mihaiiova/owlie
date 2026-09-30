---
'@owlieio/owlie': minor
---

A page that declares itself an article (`og:type` article or a JSON-LD article
type) is now extracted as article text even when it embeds an audio player.
Only structured podcast data (JSON-LD `PodcastEpisode`/`AudioObject`, or an
oEmbed resolving to audio) makes such a page an episode. `--podcast-page` still
forces the episode path. A `video` oEmbed is no longer treated as episode audio.
