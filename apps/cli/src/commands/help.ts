const HELP = `owlie — local-first content extraction and processing

Usage:
  owlie <command> [options]

Commands:
  extract   Extract content from a YouTube video, an article, or an RSS/Atom feed
  resolve   Resolve a URL to its validated audio media URL (no transcription)
  list      List entries in an RSS/Atom feed
  process   Process text, a document, a URL, or a feed's linked items with an LLM
  models    List current models for your LLM providers
  auth      Manage API keys for LLM providers
  setup     Configure providers and models interactively
  doctor    Report local environment health
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
  --timeout-ms N   Bound one complete invocation (ms)
  --max-network-bytes N  Cap total network download bytes
  --max-stdout-bytes N   Cap total stdout bytes
  --max-media-bytes N  Cap a direct-media download in bytes
  --each           Process each linked item of an RSS/Atom feed (process only)
  --env-file PATH  Load an explicit environment file
  --hosted         Deterministic mode: flags and process env only (no dotenv, saved profile, or model cache)

Exit codes:
  0 success, 1 error, 2 usage error, 3 not implemented, 130 cancelled
`;

const EXTRACT_HELP =
  'owlie extract URL [--podcast-media | --podcast-page | --podcast-apple] [--json] [--language LANG] [--limit N] [--timeout-ms N] [--max-network-bytes N] [--max-stdout-bytes N] [--max-media-bytes N]\n\n' +
  'Extract content from a URL. A YouTube video or static article writes its\n' +
  'normalized text to stdout, or a JSON NormalizedDocument with --json. An\n' +
  'RSS/Atom feed URL writes a single JSON envelope of its bounded linked items,\n' +
  'each with its URL, title, and normalized document or structured error.\n' +
  '--limit bounds feed extraction (default 10, max 500). --language sets a\n' +
  'comma-separated language priority list for YouTube transcripts (default en).\n' +
  '--timeout-ms applies one positive end-to-end deadline to the complete\n' +
  'invocation: listing, safe HTTP requests, extraction/transcription, feed\n' +
  'processing, and provider calls. Cancellation exits 130 with a structured\n' +
  'record in --json mode.\n' +
  '--max-network-bytes caps total network download bytes for core-fetched\n' +
  'content (feeds, articles, episode pages, Apple lookups) and direct media.\n' +
  '--max-stdout-bytes caps total stdout bytes before the protocol boundary.\n' +
  '--max-media-bytes caps a direct-media download; omit it to retain the safe\n' +
  'default.\n' +
  'A resolver-selection flag (--podcast-media, --podcast-page, --podcast-apple)\n' +
  'asserts which podcast resolver finds the audio URL; at most one may be\n' +
  'supplied and it overrides URL recognition without fallback.';

const RESOLVE_HELP =
  'owlie resolve URL [--podcast-media | --podcast-page | --podcast-apple] [--json]\n\n' +
  'Resolve a URL to its validated audio media URL without downloading or\n' +
  'transcribing. Writes the media URL (or a JSON envelope with --json) to\n' +
  'stdout. A resolver-selection flag is authoritative; without one, resolvers\n' +
  'run in recognition order and never fall back to article extraction.';

const LIST_HELP =
  'owlie list FEED_URL [--limit N] [--json]\n\n' +
  'List entries in an RSS/Atom feed, bounded by --limit (default 10, max 500).\n' +
  'Writes a line-oriented summary to stdout, or a JSON envelope of collection\n' +
  'metadata, item metadata, and truncation state with --json.';

const PROCESS_HELP =
  'owlie process [FILE|URL] --prompt "..." [--model provider/model-id] [--input FILE] [--input-format text|json] [--json]\n' +
  'owlie process FEED_URL --each [--limit N] --prompt "..." [--model provider/model-id]\n\n' +
  'Process plain text, a normalized document, or a URL with an LLM (DeepSeek\n' +
  'or OpenAI). Reads exactly one input: a positional http(s) URL (extracted\n' +
  'first through the universal YouTube/podcast/article rule), a positional\n' +
  'file, --input FILE, or stdin. --model selects the model; use\n' +
  'provider/model-id to select the provider too, or a plain model-id with\n' +
  'the saved active provider or OWLIE_PROVIDER. Model ids are discovered at\n' +
  'runtime (see `owlie models`). With --each and a feed URL, processes each\n' +
  'bounded linked item sequentially and streams one JSONL record per\n' +
  'attempted entry (success: item, document, result; failure: item, error).\n' +
  '--limit bounds the batch (default 10, max 500).';

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
  'YouTube transcript fetching, interactively. The model list is fetched live\n' +
  'from the chosen provider (no fallback or cache), and choices are persisted\n' +
  'per provider for future commands.';

const DOCTOR_HELP =
  'owlie doctor [--json]\n\n' +
  'Report local environment health: Node version, platform, per-provider API\n' +
  'key and model presence and credential source (DeepSeek and OpenAI, never the\n' +
  'secret values), the functional adapters (YouTube, RSS, article), and the\n' +
  'writable config and cache directories.';

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
  return `owlie ${command}\n\nUnknown command; run "owlie --help" for usage.`;
}
