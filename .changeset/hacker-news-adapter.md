---
'@owlieio/owlie': minor
---

Hacker News support (ADR 0038). `owlie list` reads the front page, newest, best,
Ask HN, Show HN and a user's submissions through the official HN API, with
each story's HN id, kind, score, comment count and linked URL. `owlie extract`
on an item URL returns its discussion (the post and a bounded comment tree),
its linked article, or both in one document with `--hn-content`, and
`--max-comments`, `--comment-depth` and `--max-top-level-comments` bound the
comments. Adds the `hackernews` source type: consumers that check the
source-type enum must accept it. `news.ycombinator.com/rss` stays an RSS feed.
