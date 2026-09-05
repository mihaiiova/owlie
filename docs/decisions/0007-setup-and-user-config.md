# ADR 0007 — `owlie setup` and persistent user configuration

- **Status:** Accepted (flat config, hardcoded model fallback, and model-based
  provider inference superseded by [ADR 0017](0017-openai-provider-and-explicit-provider-selection.md))
- **Date:** 2026-08-19

## Context

Configuring an LLM provider required setting environment variables
(`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`) or passing `--model` on every
invocation. There was no guided, persistent way to configure a provider and
model, and the model list was hardcoded.

## Decision

- Add a single interactive `owlie setup` command that walks the user through
  provider → API key → model selection and persists the result.
- Fetch the model list live from the provider's OpenAI-compatible
  `GET {baseUrl}/models` endpoint during setup, falling back to a hardcoded
  known list on failure.
- Persist `{ provider, model, apiKey, baseUrl }` as JSON at
  `~/.config/owlie/config.json` (XDG-aware), written with `0600` permissions.
- Insert the user config file into the precedence chain below `.env` and
  environment variables (flags → env → `.env.local` → `.env` → user config →
  defaults).
- Make `resolveProcessor` lenient: accept any non-empty model id (the model
  list is dynamic); the provider validates the model at call time.
- Report model/provider presence in `owlie doctor` (presence only; the API key
  is never echoed).

## Consequences

- A first-time user can configure the tool in one guided step; subsequent
  `owlie process` invocations need no flags or environment variables.
- Secrets are stored in a `0600` file and never written to stdout/stderr.
- The setup flow is extensible: future sections (proxy, Reddit, transcription)
  register a new setup section without rearchitecting the command.
