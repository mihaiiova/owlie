# CLI reference

Flags and behaviour details for people who use `owlie` every day or build on
it. The README covers getting started; the [CLI contract](cli-contract.md)
is the authoritative contract for streams, the `--json` protocol, exit codes,
and hosted mode.

## Commands

```bash
owlie --help
owlie --version [--json]
owlie doctor [--json]
owlie extract URL   # article page, YouTube video, podcast media/Apple episode/episode page, Hacker News item, or bounded feed (direct or discovered page)
owlie resolve URL   # print the validated audio media URL without transcribing
owlie list URL      # list entries in an RSS/Atom feed or a Hacker News list
owlie process FILE|URL --prompt "..." [--model provider/model-id]  # DeepSeek or OpenAI
owlie process FEED_URL --each --prompt "..."  # stream one JSONL record per feed item
owlie models [--provider PROVIDER] [--refresh]  # list live models (cached, dynamic)
owlie auth add|list|remove PROVIDER  # manage API keys in the local store
owlie setup        # configure providers, models, and API keys
owlie capabilities [--json]  # report the artifact, schema, and catalog manifest
```

The remaining planned commands (`search`, `config`) are not exposed: they
report an "unknown command" usage error (exit code 2) rather than pretending
to work.

## Global options

| Option                                                                  | Applies to                                  | Description                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--help`, `-h`                                                          | all                                         | Show help (or help for a command)                                                                                         |
| `--version`, `-V`                                                       | all                                         | Show version (`--version --json` emits the versioned envelope)                                                            |
| `--quiet`, `-q`                                                         | all                                         | Suppress diagnostics on stderr                                                                                            |
| `--json`                                                                | all                                         | Emit the versioned JSON subprocess protocol on stdout (`{ schemaVersion, command, result }` envelope, or versioned JSONL) |
| `--env-file PATH`                                                       | all                                         | Load an explicit environment file                                                                                         |
| `--hosted`                                                              | all                                         | Deterministic mode: flags and process env only (no dotenv, saved profile, or model cache)                                 |
| `--model MODEL`                                                         | `process`                                   | Select the model (`provider/model-id`, or `model-id`)                                                                     |
| `--refresh`                                                             | `models`                                    | Bypass the model cache                                                                                                    |
| `--language LANG`                                                       | `extract`                                   | Comma-separated transcript languages (default `en`)                                                                       |
| `--limit N`                                                             | `list`, `extract` (feeds), `process --each` | Bound listing/extraction (default 10, max 500)                                                                            |
| `--timeout-ms N`                                                        | all networked commands                      | One invocation-wide deadline across listing, HTTP, extraction/transcription, feeds, and providers                         |
| `--max-network-bytes N`                                                 | all networked commands                      | Cap total network download bytes through the core fetch seam and direct media                                             |
| `--max-stdout-bytes N`                                                  | all networked commands                      | Cap total stdout bytes before the protocol boundary                                                                       |
| `--max-media-bytes N`                                                   | `extract` (direct media)                    | Cap the download size in bytes (direct-media override)                                                                    |
| `--each`                                                                | `process`                                   | Process each linked item of an RSS/Atom feed                                                                              |
| `--input FILE`                                                          | `process`                                   | Read input from a file instead of a positional argument or stdin                                                          |
| `--input-format text\|json`                                             | `process`                                   | Declare the input format (`text` default)                                                                                 |
| `--article` / `--feed`                                                  | `extract`                                   | Force the article or feed path for a page URL (no fallback)                                                               |
| `--podcast-media` / `--podcast-page` / `--podcast-apple`                | `extract`, `resolve`                        | Authoritative resolver selection (no fallback)                                                                            |
| `--hn-content discussion\|article\|both`                                | `extract` (Hacker News items)               | Read the discussion (default), the linked article, or both in one document                                                |
| `--max-comments N` / `--comment-depth N` / `--max-top-level-comments N` | `extract` (Hacker News items)               | Bound the comment tree (defaults 100 / 2 / 30; max 300 / 3 / 100)                                                         |

Exit codes are listed in the [CLI contract](cli-contract.md#exit-codes).

## Hosted mode

```bash
# Deterministic invocation for a hosted subprocess: flags and injected process
# environment only (no .env, saved profile, or model-cache fallback).
owlie --hosted process transcript.txt --prompt "Summarize this"
owlie --hosted doctor --json   # reports configurationSource: hosted

# Send all extraction traffic (pages, feeds, media, YouTube) through a proxy.
# Set a proxy URL or a Webshare pair, never both; hosted mode reads process env.
OWLIE_PROXY_URL="socks5://user:pass@proxy.example:1080" owlie --hosted extract URL --json
OWLIE_WEBSHARE_PROXY_USERNAME=… OWLIE_WEBSHARE_PROXY_PASSWORD=… owlie --hosted extract URL --json
```

See [Hosted mode](cli-contract.md#hosted-mode) in the CLI contract and
[Extraction proxy](configuration.md#extraction-proxy) in the configuration
guide.

## How extraction behaves

`owlie list` exposes the RSS adapter's bounded listing, and `owlie extract`
dispatches a direct URL to the YouTube or podcast adapter — or, for a feed
URL (or an HTML page URL that exposes one), extracts its bounded linked items
into one JSON envelope. Bounded one-hop feed discovery fetches only the
supplied page, reads `<link rel="alternate">` elements with a constrained
tokenizer, and otherwise probes six fixed same-origin conventional paths; it
never executes JavaScript or follows links recursively. `owlie resolve`
prints a validated audio media URL without transcribing it, with optional
`--podcast-media`/`--podcast-page`/`--podcast-apple` resolver selection.

Remote text fetches allow only globally routable destinations by default,
canonically classify IPv4/IPv6 addresses, reject URL userinfo, and omit URL
query and fragment data from diagnostics.

For direct podcast media, `--timeout-ms` applies one deadline across
resolution, download, ffprobe, ffmpeg, and local Whisper; `--max-media-bytes`
caps the download (the existing safe HTTP cap remains the default). Both values
must be positive integers. `ffprobe` validates downloaded media before
transcoding, independently of weak or absent HTTP content types; invalid media
is rejected. The configured Whisper model must already be local, because
extraction never downloads model weights. Cancellation terminates active local
transcription commands and removes temporary downloads/intermediates.

Every networked command also accepts an invocation-wide `--timeout-ms` deadline
plus `--max-network-bytes` and `--max-stdout-bytes` budgets. Cancellation
(SIGINT/SIGTERM or an expired deadline) exits 130 with a versioned
`kind: "cancelled"` terminal record in `--json` mode, distinct from ordinary
errors. See [Invocation-wide job controls](cli-contract.md#invocation-wide-job-controls).
