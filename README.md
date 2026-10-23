# Owlie CLI

[![npm](https://img.shields.io/npm/v/@owlieio/owlie)](https://www.npmjs.com/package/@owlieio/owlie)
[![codecov](https://codecov.io/gh/mihaiiova/owlie/branch/main/graph/badge.svg)](https://codecov.io/gh/mihaiiova/owlie)

Ask an LLM anything about a URL, or turn it into clean text you can read or
pipe: articles, PDFs, arXiv papers, YouTube videos, podcast episodes and
shows, RSS/Atom feeds, and Hacker News threads.

```bash
owlie process "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --prompt "Give me the gist, with supporting facts for each claim"
```

## Install

Requires Node.js 22 or later.

```bash
npm i -g @owlieio/owlie
```

Or try it without installing:

```bash
npx @owlieio/owlie@latest extract "https://paulgraham.com/greatwork.html"
```

## Try it

`owlie process` reads a URL and runs your prompt on it with your own DeepSeek or
OpenAI key. Run `owlie setup` once to pick a provider, model and key.

```bash
owlie setup
owlie process "https://paulgraham.com/greatwork.html" --prompt "What are the three main ideas?"
owlie process "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --prompt "Summarize this video"
```

No key needed to get the text itself, or to list a feed:

```bash
owlie extract "https://paulgraham.com/greatwork.html"       # an article as plain text
owlie extract "https://www.youtube.com/watch?v=dQw4w9WgXcQ" # a video's transcript
owlie list "https://simonwillison.net/atom/everything/" --limit 3
```

```text
$ owlie list "https://simonwillison.net/atom/everything/" --limit 3
listing feed
Simon Willison's Weblog
Hello Python 3.15, goodbye 3.10, and now I can use 3.11 — https://simonwillison.net/2026/Oct/12/python-3-15/ (2026-10-12T18:15:38.000Z)
web-edit 0.1a0 — https://simonwillison.net/2026/Oct/12/web-edit/ (2026-10-12T15:54:36.000Z)
datasette-ports 0.4 — https://simonwillison.net/2026/Oct/12/datasette-ports/ (2026-10-12T04:57:07.000Z)
```

Results go to stdout and progress goes to stderr, so every command composes over
pipes. Add `--json` for a versioned, machine-readable envelope.

> **Status: pre-1.0 (0.x), actively developed.** The commands in this README
> work today; the `--json` protocol is versioned. Release notes are in the
> [changelog](CHANGELOG.md), and [Product scope](docs/product-scope.md) lists
> what works, what is planned, and what is out of scope.

## Recipes

### Ask about an article or video

```bash
owlie process "https://paulgraham.com/greatwork.html" --prompt "Summarize this in five bullet points"
owlie process "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --prompt "List every claim with its supporting facts"
owlie process "https://news.ycombinator.com/item?id=8863" --prompt "What do commenters agree and disagree on?"
```

Pass `--model openai/gpt-4o-mini` (or another `provider/model`) to skip the
configured default, and `--json` for a machine-readable result.

### Read an article

```bash
owlie extract "https://paulgraham.com/greatwork.html"          # plain text with paragraphs
owlie extract "https://paulgraham.com/greatwork.html" --json   # title, text, metadata, provenance
```

### Read a PDF

PDF links and local PDF files are read as text documents: running headers,
footers and page numbers are dropped, and words hyphenated across lines are
joined. `--json` adds `metadata.format: "pdf"`, `pageCount`, and the title and
author from the file. Scanned PDFs (no text layer) are not supported.

```bash
owlie extract "https://arxiv.org/pdf/1706.03762"
owlie extract ./report.pdf --json
owlie process ./paper.pdf --prompt "What problem does this solve, and how?"
```

### Keep up with arXiv

A paper URL (`/abs/`, `/pdf/` or `/html/`) returns its title, authors and
abstract, then the paper itself: the HTML render with formulas kept as LaTeX,
or the PDF when there is no render. Categories and searches list papers with a
stable `arxiv:<id>` identity, so cross-listed and revised papers don't appear
twice.

```bash
owlie extract "https://arxiv.org/abs/1706.03762"
owlie extract "https://arxiv.org/abs/1706.03762" --abstract-only --json   # metadata only
owlie list "https://rss.arxiv.org/rss/cs.CL" --limit 20                    # today's announcements
owlie list "https://export.arxiv.org/api/query?search_query=abs:%22retrieval%20augmented%22" --limit 10
owlie extract "https://rss.arxiv.org/rss/cs.CL" --limit 5                  # read each paper
```

Owlie follows arXiv's API terms: one API request every three seconds and at
most 200 papers per listing.

### Get a YouTube transcript

```bash
owlie extract "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
owlie extract "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --language en,es
```

### Follow a podcast

A show's RSS feed or its Apple Podcasts link both work. Each episode lists its
audio file, duration, and any publisher transcript (`<podcast:transcript>`)
links, so you can skip transcribing when the show publishes one.

```bash
owlie list "https://podcasts.apple.com/us/podcast/unexplainable/id1554578197" --limit 5
owlie list "https://feeds.megaphone.fm/vergecast" --limit 5 --order newest --json
owlie resolve "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"   # one episode's audio URL
```

Large feeds are cut short once `--limit` entries are read; `--order newest`
reads the whole feed (up to `--max-feed-bytes`, 32 MiB by default) and sorts by
date.

### Summarize a feed with an LLM

Without `owlie setup`, pass a key and model directly:

```bash
export OPENAI_API_KEY=sk-...
owlie process "https://simonwillison.net/atom/everything/" --each --limit 5 \
  --model openai/gpt-4o-mini --prompt "Summarize this post in two sentences"
```

Each feed item is read in full and streamed as one JSONL record.

## More examples

Every command writes its result to **stdout** and diagnostics/progress to
**stderr**, so commands compose over Unix pipes. JSON output (`--json`) is never
mixed with progress text. In `--json` mode every successful single-result command
writes one versioned envelope `{ schemaVersion, command, result }`; streaming
commands (`process --each`) write versioned JSONL records. stderr carries
versioned JSONL progress and terminal error/cancellation records (ADR 0030).

### Process

```bash
# Process a URL directly (extracted through the universal dispatch first);
# a feed URL is rejected here — use --each instead
owlie process "https://example.com/article" --prompt "Summarize this"
owlie process "https://www.youtube.com/watch?v=..." --prompt "Give me the gist"

# Pipe an extracted transcript into the LLM
owlie extract "https://www.youtube.com/watch?v=..." | owlie process --prompt "Summarize this"

# Process a file, or declare the input with --input
owlie process transcript.txt --prompt "Summarize this"
owlie process --input transcript.txt --prompt "Summarize this"

# Process a normalized JSON document (e.g. a previous extract --json)
owlie extract "https://www.youtube.com/watch?v=..." --json |
  owlie process --input-format json --prompt "Extract the key claims"

# Select provider and model explicitly (self-contained)
owlie process transcript.txt --prompt "Summarize this" --model openai/gpt-4o-mini

# JSON result instead of text/markdown
owlie process transcript.txt --prompt "Summarize this" --json

# Process each linked item of a feed, streaming one JSONL record per item.
# A direct feed URL or an HTML page URL that exposes a feed both work.
owlie process "https://example.com/feed.xml" --each --limit 20 --prompt "Summarize this"
owlie process "https://example.com/" --each --limit 20 --prompt "Summarize this"
```

### Extract

```bash
# YouTube transcript (pure-JS, no Python; --language is a priority list)
owlie extract "https://www.youtube.com/watch?v=..."
owlie extract "https://www.youtube.com/watch?v=..." --language en,es
owlie extract "https://www.youtube.com/watch?v=..." --json   # JSON NormalizedDocument

# Podcast audio (requires local Python + faster-whisper, ffmpeg, ffprobe,
# and a pre-provisioned Whisper model). A direct-media invocation can bound
# the whole operation and the download size.
owlie extract "https://cdn.example.com/episode.mp3" --timeout-ms 900000 --max-media-bytes 536870912
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"
owlie extract "https://publisher.example/episodes/my-episode"

# Authoritative resolver selection (no fallback; at most one flag)
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345?i=67890" --podcast-apple

# An article page (declared by og:type/JSON-LD, or with a long readable body)
owlie extract "https://example.com/posts/a-story" --json
# A PDF (a .pdf link, a declared application/pdf body, or a local file)
owlie extract "https://example.com/whitepaper.pdf" --json

# Bounded linked-item extraction from an RSS/Atom feed (one JSON envelope).
# A direct feed URL or a non-article HTML page that exposes a feed both work.
owlie extract "https://example.com/feed.xml" --limit 20
owlie extract "https://example.com/" --limit 20
# An Apple Podcasts show URL resolves to the show's RSS feed (Apple lookup)
owlie extract "https://podcasts.apple.com/us/podcast/example/id12345" --limit 5

# A Hacker News story's discussion, its linked article, or both in one document
owlie extract "https://news.ycombinator.com/item?id=8863" --hn-content both

# Force either path for a page URL (no fallback)
owlie extract "https://example.com/" --article
owlie extract "https://example.com/posts/a-story" --feed
```

### List

```bash
# A feed URL works directly; an HTML page URL that exposes a feed is discovered
owlie list "https://example.com/feed.xml" --limit 20
owlie list "https://example.com/" --limit 20
owlie list "https://example.com/feed.xml" --json   # collection + item metadata + truncated
owlie list "https://news.ycombinator.com/" --limit 30   # the Hacker News front page
owlie list "https://podcasts.apple.com/us/podcast/example/id12345"   # an Apple Podcasts show's feed
owlie list "https://example.com/feed.xml" --order newest   # sort by publication date, not feed order
```

### Resolve

```bash
# Print the validated audio media URL without downloading or transcribing
owlie resolve "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"
owlie resolve "https://publisher.example/episodes/my-episode" --podcast-page --json
```

### Models

```bash
owlie models                          # all configured providers (provider/model-id)
owlie models --provider deepseek      # one provider (plain model ids)
owlie models --provider openai --refresh --json
```

### Auth

```bash
owlie auth add deepseek     # prompts for the key and stores it
owlie auth list             # shows the credential source, never the key
owlie auth remove openai
```

### Setup and doctor

```bash
owlie setup    # interactive: provider, model, API key, optional YouTube proxy, Whisper model
owlie doctor   # Node/platform, per-provider key+model, adapters, transcription readiness
owlie doctor --json
```

### Environment and quiet mode

```bash
# Load credentials from an explicit environment file
owlie process transcript.txt --prompt "Summarize this" --env-file ./credentials.env

# Suppress diagnostics on stderr
owlie extract "https://www.youtube.com/watch?v=..." --quiet
```

Every flag, the hosted-mode details, and how extraction behaves are in the
[CLI reference](docs/cli-reference.md); exit codes and the `--json` protocol are
in the [CLI contract](docs/cli-contract.md).

## Using Owlie from another product

Owlie is built for two audiences: people running it at a terminal, and products
that run the published `owlie` command as a subprocess (typically in a
container). Every product integrates through the same public contract: the
`--hosted` mode, the versioned `--json` protocol, invocation-wide job controls,
and `owlie capabilities`. See
[Integrating Owlie as a subprocess](docs/cli-contract.md#integrating-owlie-as-a-subprocess).

```text
consuming product  →  runs `owlie` CLI (container/subprocess)
```

A consuming product owns its own UI, users, billing, persistence, scheduling,
monitoring, storage, and deployment. The private `owlie-app` is the first such
product; others may follow. Owlie never imports from a consuming product. See
[docs/repository-boundaries.md](docs/repository-boundaries.md).

## Repository map

```text
apps/cli/                    The owlie executable
packages/core/               Provider-neutral contracts and types
packages/testing/            Fakes, fixtures, contract-test helpers
packages/adapter-youtube/    YouTube adapter (videos in v0.1)
packages/adapter-article/    Static server-rendered article and PDF adapter
packages/adapter-arxiv/      arXiv papers, category feeds and searches
packages/adapter-podcast/    Podcast media, Apple show and episode, and episode-page adapter
packages/adapter-rss/        RSS/Atom adapter (fetch, list, extract; `owlie list` exposes listing)
packages/adapter-hackernews/ Hacker News adapter (lists and item discussions, official API)
packages/adapter-reddit/     Reddit adapter (Atom transport only; scaffold)
packages/provider-deepseek/  DeepSeek content processor
packages/provider-openai/    OpenAI content processor
packages/provider-whisper/   Local faster-whisper transcriber
docs/                        Architecture, contracts, security, decisions
```

## Packages

| Package                       | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `@owlieio/core`               | Types, contracts, limits, safe HTTP policy/fetch, orchestration |
| `@owlieio/testing`            | Fakes, fixtures, contract-test helpers                          |
| `@owlieio/adapter-youtube`    | YouTube videos (playlists deferred)                             |
| `@owlieio/adapter-article`    | Safe static server-rendered editorial-page and PDF extraction   |
| `@owlieio/adapter-arxiv`      | arXiv papers (API metadata, HTML render or PDF) and listings    |
| `@owlieio/adapter-podcast`    | Podcast media, Apple shows and episodes, declarative pages      |
| `@owlieio/adapter-rss`        | RSS/Atom feeds and entries (fetch, list, extract)               |
| `@owlieio/adapter-hackernews` | Hacker News lists and item discussions (official API)           |
| `@owlieio/adapter-reddit`     | Subreddits via public Atom feeds (scaffold)                     |
| `@owlieio/provider-deepseek`  | DeepSeek `ContentProcessor`                                     |
| `@owlieio/provider-openai`    | OpenAI `ContentProcessor`                                       |
| `@owlieio/provider-whisper`   | Local faster-whisper `Transcriber`                              |
| `@owlieio/owlie`              | The `owlie` command-line interface (published)                  |

v0.1 adds `@owlieio/provider-deepseek` and makes `@owlieio/provider-openai`
functional, both implemented with `ai` (`@ai-sdk/deepseek` and
`@ai-sdk/openai`) behind the provider-neutral `ContentProcessor` contract.

Only `@owlieio/owlie` is published. The other `@owlieio/*` packages are internal
(private) — they organize the code and enforce dependency boundaries, and are
bundled into the `@owlieio/owlie` package at build time. They are never
published to npm; only the `@owlieio` scope is claimed for the published CLI.

## Development setup

Prerequisites: Node.js (pinned via `.nvmrc`; `engines` requires `>=22`), pnpm
(pinned via `packageManager`).

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build, exports, smoke
pnpm build        # build all packages
pnpm cli --help   # run the built CLI
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Further reading

- [Architecture](docs/architecture.md)
- [Product scope](docs/product-scope.md)
- [CLI reference](docs/cli-reference.md)
- [CLI contract](docs/cli-contract.md)
- [Output formats](docs/output-formats.md)
- [Configuration](docs/configuration.md)
- [Repository boundaries](docs/repository-boundaries.md)
- [Security model](docs/security-model.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE) (Apache-2.0)
