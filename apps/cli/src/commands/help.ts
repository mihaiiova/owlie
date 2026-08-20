const HELP = `owlie — local-first content extraction and processing

Usage:
  owlie <command> [options]

Commands:
  extract   Extract content from a YouTube video, an article, or an RSS/Atom feed
  list      List entries in an RSS/Atom feed
  process   Process text, a document, or a feed's linked items with an LLM
  setup     Configure providers and models interactively
  doctor    Report local environment health
  help      Show this help

Options:
  --help, -h       Show help (or help for a command)
  --version, -V    Show version
  --quiet, -q      Suppress diagnostics on stderr
  --json           Emit machine-readable JSON on stdout
  --model MODEL    Select the model (e.g. deepseek-chat)
  --language LANG  Select transcript languages (comma-separated; default en)
  --limit N        Bound collection listing and feed extraction (max 500)
  --each           Process each linked item of an RSS/Atom feed (process only)
  --env-file PATH  Load an explicit environment file (reserved)

Exit codes:
  0 success, 1 error, 2 usage error, 3 not implemented
`;

const EXTRACT_HELP =
  'owlie extract URL [--json] [--language LANG] [--limit N]\n\n' +
  'Extract content from a URL. A YouTube video or static article writes its\n' +
  'normalized text to stdout, or a JSON NormalizedDocument with --json. An\n' +
  'RSS/Atom feed URL writes a single JSON envelope of its bounded linked items,\n' +
  'each with its URL, title, and normalized document or structured error.\n' +
  '--limit bounds feed extraction (default 10, max 500). --language sets a\n' +
  'comma-separated language priority list for YouTube transcripts (default en).';

const LIST_HELP =
  'owlie list FEED_URL [--limit N] [--json]\n\n' +
  'List entries in an RSS/Atom feed, bounded by --limit (default 10, max 500).\n' +
  'Writes a line-oriented summary to stdout, or a JSON envelope of collection\n' +
  'metadata, item metadata, and truncation state with --json.';

const PROCESS_HELP =
  'owlie process [FILE] --prompt "..." [--input FILE] [--input-format text|json] [--model MODEL] [--json]\n' +
  'owlie process FEED_URL --each [--limit N] --prompt "..."\n\n' +
  'Process plain text or a normalized document with an LLM. Reads exactly one\n' +
  'input: a positional file, --input FILE, or stdin. Never fetches a URL in\n' +
  'single-input mode. With --each and a feed URL, processes each bounded\n' +
  'linked item sequentially and streams one JSONL record per attempted entry\n' +
  '(success: item, document, result; failure: item, error). --limit bounds the\n' +
  'batch (default 10, max 500).';

const SETUP_HELP =
  'owlie setup\n\n' +
  'Configure your LLM provider, model, API key, and (optionally) a proxy for\n' +
  'YouTube transcript fetching, interactively. The model list is fetched live\n' +
  'and choices are persisted for future commands.';

const DOCTOR_HELP =
  'owlie doctor [--json]\n\n' +
  'Report local environment health: Node version, platform, DeepSeek API key\n' +
  'presence, configured model, the functional adapters (YouTube, RSS, article)\n' +
  'and provider (DeepSeek), and the writable config and cache directories.';

export function helpText(): string {
  return HELP;
}

export function commandHelp(command: string): string {
  if (command === 'extract') return EXTRACT_HELP;
  if (command === 'list') return LIST_HELP;
  if (command === 'process') return PROCESS_HELP;
  if (command === 'setup') return SETUP_HELP;
  if (command === 'doctor') return DOCTOR_HELP;
  return `owlie ${command}\n\nUnknown command; run "owlie --help" for usage.`;
}
