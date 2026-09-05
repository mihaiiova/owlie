# Configuration

## Precedence

```text
command-line flags
    ↓
process environment variables
    ↓
.env.local
    ↓
.env
    ↓
user configuration file
    ↓
documented defaults
```

## Where loading happens

Environment-file loading belongs only to the `owlie` CLI. Core, adapters, and
providers receive explicit configuration objects and never read environment
variables themselves.

In v0.1 the functional LLM providers are DeepSeek and OpenAI, each configured
with its own variables (`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`
and `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL`). Local Whisper
transcription is a deferred scaffold; its variables below are documented for
later use and must not be assumed functional.

Provider selection: `--provider <provider>` on the command line takes
precedence over `OWLIE_PROVIDER`, which takes precedence over the saved active
provider. A provider is never inferred from a model id; an absent or unknown
provider fails with a clear configuration error.

Model selection within the chosen provider: `--model <model>` takes precedence
over that provider's `*_MODEL` variable; both are loaded only by the CLI and
passed to the provider as explicit configuration. A model-using command without
a selected model fails with a clear configuration error. DeepSeek documents a
`deepseek-chat` default; OpenAI has no default model.

## Environment files

`--env-file /path/to/credentials.env` is reserved for an explicit environment
file. `.env.example` documents empty, supported provider variables. Never
commit real credentials.

## User configuration

`owlie setup` writes the selected provider and a provider-keyed profile to a
JSON file in the platform-appropriate config directory (XDG-aware):
`~/.config/owlie/config.json` on macOS/Linux, written with `0600` permissions.

```json
{
  "provider": "deepseek",
  "providers": {
    "deepseek": { "model": "deepseek-chat", "apiKey": "sk-…" },
    "openai": { "model": "gpt-4o-mini", "apiKey": "sk-…" }
  },
  "proxy": { "type": "webshare", "username": "…", "password": "…" }
}
```

Each provider profile holds a `model`, `apiKey`, and optional `baseUrl`; the
`provider` field records the active provider. The legacy flat
`{ provider, model, apiKey, baseUrl }` shape (DeepSeek-only) is still read and
migrated into a profile on load, so existing users keep working.

The `proxy` field is optional and applies only to YouTube transcript fetching:
`{ "type": "webshare", "username", "password" }` for a WebShare residential
proxy, or `{ "type": "generic", "url" }` for an HTTP/SOCKS proxy. Omitting it
(or choosing "none" in `owlie setup`) uses a direct connection.

The stored profile values are the lowest-priority explicit source (below `.env`
and environment variables), so `--model`/`--provider` and the provider-specific
variables still override them. The API key and proxy credentials are never
echoed to the terminal; they are only written to the config file.

## Transcription defaults

Transcription (local faster-whisper) is deferred and not implemented in v0.1.
These defaults document the future configuration shape only:

```yaml
transcription:
  provider: whisper-local
  model: small
  language: auto
  computeType: int8
```

## What is not required

No Owlie account, user ID, server, Postgres, R2, Stripe, or hosted credits.
There is no secrets vault.
