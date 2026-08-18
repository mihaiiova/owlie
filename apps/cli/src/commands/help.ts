export const PLANNED_COMMANDS = ['list', 'extract', 'search', 'process', 'config'] as const;
export type PlannedCommand = (typeof PLANNED_COMMANDS)[number];

const HELP = `owlie — local-first content extraction and processing

Usage:
  owlie <command> [options]

Commands:
  list      List items in a collection             (planned)
  extract   Extract normalized text from an item   (planned)
  search    Search collection-provided fields      (planned)
  process   Process documents with an LLM          (planned)
  config    View and edit configuration            (planned)
  doctor    Report local environment health
  help      Show this help

Options:
  --help, -h       Show help (or help for a command)
  --version, -V    Show version
  --quiet, -q      Suppress diagnostics on stderr
  --json           Emit machine-readable JSON on stdout
  --env-file PATH  Load an explicit environment file (reserved)

Exit codes:
  0 success, 1 error, 2 usage error, 3 not implemented
`;

const COMMAND_HELP: Record<PlannedCommand, string> = {
  list: 'owlie list <COLLECTION_URL> [--limit N] [--sort S] [--period P]\n\nList items in a collection. Planned; not implemented yet.',
  extract:
    'owlie extract <ITEM_URL> [--output-file PATH] [--transcriber ID]\n\nExtract normalized text from an item. Planned; not implemented yet.',
  search:
    'owlie search <COLLECTION_URL> <QUERY> [--limit N] [--content]\n\nSearch collection-provided fields. Planned; not implemented yet.',
  process:
    'owlie process <URL> [--each] [--limit N] [--output FORMAT]\n\nProcess documents with an LLM. Planned; not implemented yet.',
  config:
    'owlie config [get|set PATH VALUE]\n\nView and edit configuration. Planned; not implemented yet.',
};

export function helpText(): string {
  return HELP;
}

export function commandHelp(command: string): string {
  return (
    COMMAND_HELP[command as PlannedCommand] ??
    `owlie ${command}\n\nPlanned command; not implemented yet.`
  );
}
