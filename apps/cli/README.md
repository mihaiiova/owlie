# owlie

The `owlie` command-line interface.

## Status

`--help`, `--version`, `doctor`, `extract` (YouTube transcripts), and `process`
(DeepSeek) are functional. The remaining planned commands (`list`, `search`,
`config`) are visible in help and exit with a concise "not implemented yet"
message and a non-zero code. They never pretend to process content.

## Commands

```text
owlie extract  Extract a transcript from a YouTube video
owlie process  Process text or a document with an LLM
owlie list     List items in a collection         (planned)
owlie search   Search collection-provided fields   (planned)
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
