const HELP = `owlie — general-purpose web content extractor

Usage:
  owlie <command> [options]

Commands:
  extract   Extract an article or PDF, YouTube video, podcast episode, Hacker News item, arXiv or bioRxiv/medRxiv paper, or RSS/Atom feed (direct URL or discovered page)
  resolve   Resolve a URL to its validated audio media URL (no transcription)
  list      List entries in an RSS/Atom feed (direct URL or discovered page), a Hacker News list, an arXiv category or query, or a bioRxiv/medRxiv subject
  process   Process text, a document, a URL, or a feed's linked items with an LLM
  models    List current models for your LLM providers
  auth      Manage API keys for LLM providers
  setup     Configure providers and models interactively
  doctor    Report local environment health
  capabilities  Report the artifact, schema, and catalog manifest
  help      Show this help

Options:
  --help, -h       Show help (or help for a command)
  --version, -V    Show version
  --quiet, -q      Suppress diagnostics on stderr
  --json           Emit machine-readable JSON on stdout
  --model MODEL    Select the model (provider/model-id, or model-id)
  --refresh        Bypass the model cache (models only)
  --language LANG  Select transcript languages (comma-separated; default en)
  --limit N        Bound collection listing and feed extraction (max 500)
  --order feed|newest  Feed entry order: as published in the feed (default) or newest first
  --timeout-ms N   Bound one complete invocation (ms)
  --max-network-bytes N  Cap total network download bytes
  --max-feed-bytes N     Cap one RSS/Atom feed response in bytes (default 32 MiB)
  --max-stdout-bytes N   Cap total stdout bytes
  --max-media-bytes N  Cap a direct-media download in bytes
  --each           Process each linked item of an RSS/Atom feed (process only)
  --article        Extract a page URL as an article (extract only)
  --feed           Discover and extract a page URL's feed (extract only)
  --hn-content MODE  Read a Hacker News item's discussion, linked article, or both (extract only)
  --max-comments N   Cap Hacker News comments read in total (default 100, max 300)
  --comment-depth N  Hacker News reply levels read (default 2, max 3)
  --max-top-level-comments N  Cap top-level Hacker News comments (default 30, max 100)
  --abstract-only  Read an arXiv or bioRxiv/medRxiv paper's metadata and abstract only (extract only)
  --include-replacements  Keep new versions of older papers in an arXiv category feed or bioRxiv/medRxiv subject
  --env-file PATH  Load an explicit environment file
  --hosted         Deterministic mode: flags and process env only (no dotenv, saved profile, or model cache)

Exit codes:
  0 success, 1 error, 2 usage error, 3 not implemented, 130 cancelled
`;

const EXTRACT_HELP =
  'owlie extract URL [--article | --feed | --podcast-media | --podcast-page | --podcast-apple] [--hn-content discussion|article|both] [--max-comments N] [--comment-depth N] [--max-top-level-comments N] [--abstract-only] [--include-replacements] [--json] [--language LANG] [--limit N] [--order feed|newest] [--timeout-ms N] [--max-network-bytes N] [--max-feed-bytes N] [--max-stdout-bytes N] [--max-media-bytes N]\n\n' +
  'Extract content from a URL. A YouTube video, podcast episode, or article\n' +
  'page writes its normalized text to stdout, or a JSON NormalizedDocument with\n' +
  '--json. A page is an article when it declares one (og:type or JSON-LD) or\n' +
  'has a long readable body. An RSS/Atom feed URL, or another HTML page URL\n' +
  'that exposes a feed via a link element or a conventional feed path, writes a\n' +
  'single JSON envelope of its bounded linked items, each with its URL, title,\n' +
  'and normalized document or structured error. A page that is neither is a\n' +
  'clear error. --article or --feed forces either path without fallback; they\n' +
  'exclude each other and the resolver flags. --limit bounds feed extraction (default 10,\n' +
  'max 500). --language sets a comma-separated language priority list for\n' +
  'YouTube transcripts (default en).\n' +
  '--timeout-ms applies one positive end-to-end deadline to the complete\n' +
  'invocation: listing, safe HTTP requests, extraction/transcription, feed\n' +
  'processing, and provider calls. Cancellation exits 130 with a structured\n' +
  'record in --json mode.\n' +
  '--max-network-bytes caps total network download bytes for core-fetched\n' +
  'content (feeds, articles, episode pages, Apple lookups) and direct media.\n' +
  '--max-feed-bytes caps one feed response (default 32 MiB; HTML pages keep\n' +
  '5 MiB), so podcast feeds with long back catalogues can be read.\n' +
  '--max-stdout-bytes caps total stdout bytes before the protocol boundary.\n' +
  '--max-media-bytes caps a direct-media download; omit it to retain the safe\n' +
  'default.\n' +
  'A resolver-selection flag (--podcast-media, --podcast-page, --podcast-apple)\n' +
  'asserts which podcast resolver finds the audio URL; at most one may be\n' +
  'supplied and it overrides URL recognition without fallback.\n' +
  'A Hacker News item URL (news.ycombinator.com/item?id=N) is read through the\n' +
  'official HN API. --hn-content discussion (default) writes the post and a\n' +
  'bounded comment tree; article writes the linked article (the post text for\n' +
  'a text post); both writes the article, then the discussion, and keeps the\n' +
  'discussion with a warning when the article cannot be read. --max-comments,\n' +
  '--comment-depth and --max-top-level-comments bound the comment tree.\n' +
  'These flags apply only to Hacker News item URLs; --article and --feed do not.\n' +
  'A PDF link (or a local PDF file) is read as a text document with\n' +
  'metadata.format "pdf"; scanned PDFs without a text layer are not supported.\n' +
  'An arXiv paper URL (arxiv.org/abs|pdf|html/ID) reads metadata from the arXiv\n' +
  'API and the paper from its HTML render (formulas kept as LaTeX), else its\n' +
  'PDF, else the abstract; --abstract-only skips the paper. An arXiv category\n' +
  'feed (rss.arxiv.org/rss/CAT, arxiv.org/list/CAT) or API search\n' +
  '(export.arxiv.org/api/query?search_query=...) extracts its papers as a batch;\n' +
  'replaced versions are skipped unless --include-replacements is given.\n' +
  'A bioRxiv or medRxiv preprint URL (biorxiv.org/content/DOI[vN], or\n' +
  'medrxiv.org) reads metadata from api.biorxiv.org and the preprint from its\n' +
  'full-text page, else its PDF, else the abstract; --abstract-only skips the\n' +
  'preprint. A subject (biorxiv.org/collection/SUBJECT, or /collection for a\n' +
  'whole server) extracts its preprints of the last 14 days as a batch.';

const RESOLVE_HELP =
  'owlie resolve URL [--podcast-media | --podcast-page | --podcast-apple] [--json]\n\n' +
  'Resolve a URL to its validated audio media URL without downloading or\n' +
  'transcribing. Writes the media URL (or a JSON envelope with --json) to\n' +
  'stdout. A resolver-selection flag is authoritative; without one, resolvers\n' +
  'run in recognition order and never fall back to article extraction.';

const LIST_HELP =
  'owlie list URL [--limit N] [--order feed|newest] [--include-replacements] [--json]\n\n' +
  'List entries in an RSS/Atom feed, bounded by --limit (default 10, max 500).\n' +
  'A feed URL is used directly; an HTML page URL that exposes a feed is\n' +
  'discovered first. A Hacker News list URL (/, /news, /newest, /best, /ask,\n' +
  '/show, or /submitted?id=USER) lists its stories with their HN id, kind,\n' +
  'score, comment count, and linked URL. Writes a line-oriented summary to\n' +
  'stdout, or a JSON envelope of collection metadata, item metadata, and\n' +
  'truncation state with --json. One feed response may be up to 32 MiB\n' +
  '(--max-feed-bytes N to change it). In the default feed order the download\n' +
  'stops once the entries --limit needs have arrived; --order newest sorts by\n' +
  'publication date (undated entries last) and reads the whole feed.\n' +
  'An arXiv category (rss.arxiv.org/rss/CAT[+CAT], arxiv.org/list/CAT) lists the\n' +
  'latest announcements, skipping new versions of older papers unless\n' +
  '--include-replacements is given; an API search\n' +
  '(export.arxiv.org/api/query?search_query=...) lists the newest submissions\n' +
  '(max 200). Items carry the arXiv id, version, authors, categories and license.\n' +
  'A bioRxiv/medRxiv subject (biorxiv.org/collection/SUBJECT, medrxiv.org/...,\n' +
  'or /collection for a whole server) lists the preprints posted in the last\n' +
  '14 days, newest first (max 200), skipping new versions of older preprints\n' +
  'unless --include-replacements is given. Items carry the DOI, server,\n' +
  'version, authors, subject, article type and license.';

const PROCESS_HELP =
  'owlie process [FILE|URL] --prompt "..." [--model provider/model-id] [--input FILE] [--input-format text|json] [--json]\n' +
  'owlie process FEED_URL --each [--limit N] [--order feed|newest] --prompt "..." [--model provider/model-id]\n\n' +
  'Process plain text, a normalized document, or a URL with an LLM (DeepSeek\n' +
  'or OpenAI). Reads exactly one input: a positional http(s) URL (extracted\n' +
  'first through the universal YouTube/podcast/article rule), a positional\n' +
  'file, --input FILE, or stdin. --model selects the model; use\n' +
  'provider/model-id to select the provider too, or a plain model-id with\n' +
  'the saved active provider or OWLIE_PROVIDER. Model ids are discovered at\n' +
  'runtime (see `owlie models`). With --each and a feed URL — or an HTML page\n' +
  'URL that exposes one — processes each bounded linked item sequentially and\n' +
  'streams one JSONL record per attempted entry (success: item, document,\n' +
  'result; failure: item, error). --limit bounds the batch (default 10, max\n' +
  '500).';

const MODELS_HELP =
  'owlie models [--provider <provider>] [--refresh] [--json] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]\n\n' +
  "List a provider's current models from its live listing endpoint. Without\n" +
  '--provider, lists models for all configured providers. Results are cached\n' +
  'for one hour; --refresh re-queries the provider, and a failed fetch falls\n' +
  'back to a recent cached list with a diagnostic when one is available.\n' +
  'Model ids are discovered dynamically, never hardcoded.';

const AUTH_HELP =
  'owlie auth add <provider>\n' +
  'owlie auth list\n' +
  'owlie auth remove <provider>\n\n' +
  'Manage API keys in the local credential store. `add` prompts for a key and\n' +
  'stores it; `list` shows each provider and whether its effective credential\n' +
  'comes from the environment or the local store (never the key itself);\n' +
  '`remove` deletes the stored key. Environment variables override stored keys.';

const SETUP_HELP =
  'owlie setup [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N]\n\n' +
  'Configure your LLM provider, model, API key, and (optionally) a proxy for\n' +
  'all extraction traffic (pages, feeds, media, YouTube), interactively. The\n' +
  'OWLIE_PROXY_URL or OWLIE_WEBSHARE_PROXY_USERNAME/PASSWORD variables override\n' +
  'the saved proxy. The model list is fetched live\n' +
  'from the chosen provider (no fallback or cache), and choices are persisted\n' +
  'per provider for future commands.';

const DOCTOR_HELP =
  'owlie doctor [--json]\n\n' +
  'Report local environment health: Node version, platform, per-provider API\n' +
  'key and model presence and credential source (DeepSeek and OpenAI, never the\n' +
  'secret values), the functional adapters (YouTube, RSS, article), and the\n' +
  'writable config and cache directories.';

const CAPABILITIES_HELP =
  'owlie capabilities [--json]\n\n' +
  'Report the credential-free startup manifest: the artifact version, the JSON\n' +
  'protocol schema version, the normalized document schema version, and the\n' +
  'supported command, adapter, provider, and resolver ids. Makes no network\n' +
  'calls and reads no local configuration or secrets.';

export function helpText(): string {
  return HELP;
}

export function commandHelp(command: string): string {
  if (command === 'extract') return EXTRACT_HELP;
  if (command === 'resolve') return RESOLVE_HELP;
  if (command === 'list') return LIST_HELP;
  if (command === 'process') return PROCESS_HELP;
  if (command === 'models') return MODELS_HELP;
  if (command === 'auth') return AUTH_HELP;
  if (command === 'setup') return SETUP_HELP;
  if (command === 'doctor') return DOCTOR_HELP;
  if (command === 'capabilities') return CAPABILITIES_HELP;
  return `owlie ${command}\n\nUnknown command; run "owlie --help" for usage.`;
}
