# AGENTS — owlie (CLI)

Local rules for coding agents working in this package. The root `AGENTS.md`
applies first; this file adds CLI-specific guidance.

## Responsibilities

The CLI owns terminal behavior, environment-file loading, and local
configuration. It bundles `@owlieio/core`, adapters, and providers into one
self-contained published `owlie` package — it never owns content logic itself.
When adding an adapter or provider, register it in `src/registry.ts` and add it
to this package's `devDependencies`.

## Hard rules

1. **Results → stdout; diagnostics/progress → stderr.** Never mix JSON output
   with progress text.
2. **Never print secrets.** Environment-variable values, API keys, and tokens
   are never written to stdout or stderr.
3. **No telemetry.**
4. **Only the entry point (`src/bin.ts`) translates failures into exit codes.**
   Command modules return exit codes; they never call `process.exit`.
5. **Support cancellation.** Long-running commands must accept and honor
   `AbortSignal` from the process.
6. **Only implemented commands are exposed.** Help and `doctor` report only the
   functional adapters and providers. Deferred commands and scaffolds are not
   registered, so they surface as an "unknown command" usage error (exit 2)
   rather than pretending to work.
7. **Environment-file loading lives here only.** Core, adapters, and providers
   receive explicit configuration objects.
8. **Resolve `process` input at the shared seam.** Exactly one of a positional
   file, `--input FILE`, or piped stdin is allowed; use `resolveProcessInput`
   (`src/input.ts`). Ambiguity is a usage error (2); empty stdin is a general
   error (1).

## Exit codes

`0` success, `1` error, `2` usage error, `3` not implemented. Translate thrown
typed errors with `exitCodeForError` in `src/io.ts`.

## Testing

CLI tests must assert stdout, stderr, and exit status separately, using
injected I/O buffers (see `test/`). `doctor` checks must use injectable
`DoctorDeps` so tests do not spawn processes or touch the filesystem.
