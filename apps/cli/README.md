# @owlieio/owlie

Ask an LLM anything about a URL, or turn it into clean text you can read or
pipe: articles, PDFs, arXiv, bioRxiv, medRxiv and PubMed papers, YouTube videos, podcast episodes and shows, RSS/Atom feeds, and
Hacker News threads.

```bash
npm i -g @owlieio/owlie        # Node.js 22 or later
owlie process "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --prompt "Give me the gist"
```

Or without installing: `npx @owlieio/owlie@latest extract "https://paulgraham.com/greatwork.html"`.

## What it reads

| Input                                   | Example                                                            | Command                              |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Article page                            | `https://paulgraham.com/greatwork.html`                            | `extract`, `process`                 |
| YouTube video (transcript)              | `https://www.youtube.com/watch?v=…`                                | `extract`, `process`                 |
| RSS/Atom feed, or a page that links one | `https://simonwillison.net/atom/everything/`                       | `list`, `extract`, `process --each`  |
| Podcast show (feed or Apple Podcasts)   | `https://podcasts.apple.com/us/podcast/unexplainable/id1554578197` | `list`, `extract`, `process --each`  |
| Podcast episode (audio, Apple, page)    | `https://podcasts.apple.com/…?i=…`                                 | `resolve`, `extract` (local Whisper) |
| Hacker News list or item                | `https://news.ycombinator.com/item?id=8863`                        | `list`, `extract`, `process`         |
| arXiv paper, category or search         | `https://arxiv.org/abs/1706.03762`                                 | `list`, `extract`                    |
| bioRxiv/medRxiv preprint or subject     | `https://www.biorxiv.org/collection/neuroscience`                  | `list`, `extract`                    |
| PubMed article or search                | `https://pubmed.ncbi.nlm.nih.gov/?term=sepsis`                     | `list`, `extract`                    |

## Examples

```bash
# Text, no key needed
owlie extract "https://paulgraham.com/greatwork.html"
owlie extract "https://example.com/whitepaper.pdf"    # PDFs too, from a link or a local file
owlie extract "https://arxiv.org/abs/1706.03762"      # an arXiv paper, formulas as LaTeX
owlie list "https://rss.arxiv.org/rss/cs.CL" --limit 5
owlie list "https://www.biorxiv.org/collection/neuroscience" --limit 5   # bioRxiv/medRxiv, last 14 days
owlie extract "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --language en,es
owlie list "https://simonwillison.net/atom/everything/" --limit 3

# Podcasts: the latest episodes, with audio and publisher transcript links
owlie list "https://podcasts.apple.com/us/podcast/unexplainable/id1554578197" --limit 5 --json
owlie list "https://feeds.megaphone.fm/vergecast" --limit 5 --order newest
owlie resolve "https://podcasts.apple.com/us/podcast/example/id12345?i=67890"

# Ask an LLM with your own DeepSeek or OpenAI key (run `owlie setup` once)
owlie process "https://news.ycombinator.com/item?id=8863" --prompt "What do commenters agree and disagree on?"
owlie process "https://simonwillison.net/atom/everything/" --each --limit 5 \
  --model openai/gpt-4o-mini --prompt "Summarize this post in two sentences"

# Compose over pipes
owlie extract "https://www.youtube.com/watch?v=…" | owlie process --prompt "List the key claims"
```

## Commands

```text
owlie extract URL     article or PDF, arXiv, bioRxiv/medRxiv or PubMed paper, YouTube transcript, podcast audio, Hacker News item, or a bounded feed batch
owlie list URL        bounded entries of a feed, podcast show, Hacker News list, arXiv category, bioRxiv/medRxiv subject, or PubMed search
owlie resolve URL     a podcast episode's validated audio URL (no download)
owlie process ...     run a prompt on a URL, file, stdin, or each item of a feed
owlie models          available models per provider
owlie auth            add, list, or remove provider API keys
owlie setup           interactive provider, model, key, proxy, and Whisper setup
owlie doctor          local environment health
owlie capabilities    machine-readable adapters, schemas, and versions
```

Run `owlie --help` or `owlie <command> --help` for every flag.

## Contract

- Results go to stdout; progress and diagnostics go to stderr.
- `--json` writes one versioned envelope `{ schemaVersion, command, result }`;
  `process --each` streams JSONL records.
- `--timeout-ms`, `--max-network-bytes`, `--max-feed-bytes` and
  `--max-stdout-bytes` bound any networked command; cancellation exits 130.
- `--hosted` makes a run deterministic for products that call `owlie` as a
  subprocess: flags and injected environment only.
- Secrets are never printed. No telemetry.

Documentation, the full CLI reference and the changelog are on
[GitHub](https://github.com/mihaiiova/owlie#readme).

## License

Apache-2.0. See the `LICENSE` file in this package.
