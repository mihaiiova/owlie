export const PLANNED_COMMANDS = ['list', 'search', 'config'] as const;
export type PlannedCommand = (typeof PLANNED_COMMANDS)[number];

const HELP = `owlie — local-first content extraction and processing

Usage:
  owlie <command> [options]

Commands:
  list      List items in a collection             (planned)
  extract   Extract a transcript from a YouTube video
  search    Search collection-provided fields      (planned)
  process   Process text or a document with an LLM
  setup     Configure providers and models interactively
  config    View and edit configuration            (planned)
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

const COMMAND_HELP: Record<PlannedCommand, string> = {
  list: 'owlie list <COLLECTION_URL> [--limit N] [--sort S] [--period P]\n\nList items in a collection. Planned; not implemented yet.',
  search:
    'owlie search <COLLECTION_URL> <QUERY> [--limit N] [--content]\n\nSearch collection-provided fields. Planned; not implemented yet.',
  config:
    'owlie config [get|set PATH VALUE]\n\nView and edit configuration. Planned; not implemented yet.',
};

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

export function helpText(): string {
  return HELP;
}

export function commandHelp(command: string): string {
  if (command === 'extract') return EXTRACT_HELP;
  if (command === 'process') return PROCESS_HELP;
  if (command === 'setup') return SETUP_HELP;
  return (
    COMMAND_HELP[command as PlannedCommand] ??
    `owlie ${command}\n\nPlanned command; not implemented yet.`
  );
}
