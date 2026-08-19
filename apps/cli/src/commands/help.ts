const HELP = `owlie — local-first content extraction and processing

Usage:
  owlie <command> [options]

Commands:
  extract   Extract a transcript from a YouTube video
  process   Process text or a document with an LLM
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
  --env-file PATH  Load an explicit environment file (reserved)

Exit codes:
  0 success, 1 error, 2 usage error, 3 not implemented
`;

const EXTRACT_HELP =
  'owlie extract URL [--json] [--language LANG]\n\n' +
  'Extract a transcript from a YouTube video. Writes the transcript text to\n' +
  'stdout, or a JSON NormalizedDocument with --json. --language sets a\n' +
  'comma-separated language priority list (default en).';

const PROCESS_HELP =
  'owlie process [FILE] --prompt "..." [--input FILE] [--input-format text|json] [--model MODEL] [--json]\n\n' +
  'Process plain text or a normalized document with an LLM. Reads exactly one\n' +
  'input: a positional file, --input FILE, or stdin. Never fetches a URL.';

const SETUP_HELP =
  'owlie setup\n\n' +
  'Configure your LLM provider, model, API key, and (optionally) a proxy for\n' +
  'YouTube transcript fetching, interactively. The model list is fetched live\n' +
  'and choices are persisted for future commands.';

const DOCTOR_HELP =
  'owlie doctor [--json]\n\n' +
  'Report local environment health: Node version, platform, DeepSeek API key\n' +
  'presence, configured model, the functional adapter and provider, and the\n' +
  'writable config and cache directories.';

export function helpText(): string {
  return HELP;
}

export function commandHelp(command: string): string {
  if (command === 'extract') return EXTRACT_HELP;
  if (command === 'process') return PROCESS_HELP;
  if (command === 'setup') return SETUP_HELP;
  if (command === 'doctor') return DOCTOR_HELP;
  return `owlie ${command}\n\nUnknown command; run "owlie --help" for usage.`;
}
