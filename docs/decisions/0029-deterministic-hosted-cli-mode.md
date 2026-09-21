# ADR 0029 — Deterministic hosted CLI mode

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

`owlie-app` runs the published `owlie` command as a subprocess in a container.
A hosted worker inherits whatever exists in the working directory and the home
directory of that image, so the same command can behave differently depending
on a CWD-relative `.env`/`.env.local`, a saved XDG user profile
(`~/.config/owlie/config.json`), or a cached model list
(`~/.cache/owlie/models.json`) left by an earlier job. Interactive `setup` and
`auth add` also do not belong in a non-interactive worker.

## Decision

- Add a global `--hosted` flag, available to every command, that makes a single
  invocation deterministic: it accepts command-line flags and injected process
  environment only.
- In hosted mode the CLI does not load `.env`, `.env.local`, or an explicit
  `--env-file`, does not read the saved user configuration, and does not use the
  model cache as a fallback (`owlie models` always live-fetches and never reads
  or writes the cache). Combining `--hosted` with `--env-file` is a usage error.
- In hosted mode `owlie auth` and `owlie setup` are rejected with a clear usage
  error before any prompt or state write; no interactive/state-writing command
  can run inside a worker.
- `owlie doctor` reports the effective configuration-source policy in its
  machine-readable JSON output (`configurationSource: "hosted" | "local"`) and
  in the human summary.
- The hosted boundary stays CLI-local. The CLI never reads `owlie-app`
  configuration, and core/adapters/providers continue to receive explicit
  configuration objects.
- Non-hosted precedence and behavior are preserved exactly (flags → process
  env → `.env.local` → `.env` → user config → defaults).

## Consequences

- `owlie-app` can invoke `owlie --hosted process ...` with injected provider
  variables and know no filesystem configuration changes the effective
  provider/model/key.
- A worker receives a clear configuration/usage failure instead of an
  interactive prompt or an accidental cached model result.
- The hosted mode is a single strict switch, not granular toggles, keeping the
  configuration policy easy to reason about and document.
