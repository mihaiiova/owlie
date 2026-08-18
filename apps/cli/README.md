# @owlieio/cli

The `owlie` command-line interface.

## Status

Only `--help`, `--version`, and `doctor` are functional. The planned commands
(`list`, `extract`, `search`, `process`, `config`) are visible in help and exit
with a concise "not implemented yet" message and a non-zero code. They never
pretend to process content.

## Commands

```text
owlie list     List items in a collection         (planned)
owlie extract  Extract normalized text from an item (planned)
owlie search   Search collection-provided fields   (planned)
owlie process  Process documents with an LLM       (planned)
owlie config   View and edit configuration         (planned)
owlie doctor   Report local environment health
owlie help     Show help
```

## Rules

- Results go to stdout; diagnostics and progress go to stderr.
- `--json` output is never mixed with progress text.
- Secrets are never printed.
- No telemetry.
- Only the entry point translates failures into exit codes; libraries throw.

## Development

Run from the repository root:

```bash
pnpm build
pnpm cli --help
pnpm cli --version
pnpm cli doctor
pnpm test
```
