# owlie

The `owlie` command-line interface.

## Status

`--help`, `--version`, `doctor`, `extract` (YouTube transcripts), and `process`
(DeepSeek) are functional. Help and `doctor` list only what is implemented;
deferred adapters and providers are not exposed.

## Commands

```text
owlie extract  Extract a transcript from a YouTube video
owlie process  Process text or a document with an LLM
owlie setup    Configure provider, model, and API key
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
