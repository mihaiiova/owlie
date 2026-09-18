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
transcription is configured only through the saved user configuration; its
provider receives explicit configuration and never reads environment variables.

Provider selection: `--model provider/model-id` is self-contained and
authoritative. A plain `--model model-id` resolves the provider from the
deprecated `--provider` alias, then `OWLIE_PROVIDER`, then the saved active
provider. A `--provider` that disagrees with a compound `--model` provider is a
clear configuration error. An absent or unknown provider fails with a clear
configuration error.

Model selection within the chosen provider: `--model model-id` takes precedence
over that provider's `*_MODEL` variable; both are loaded only by the CLI and
passed to the provider as explicit configuration. A model-using command without
a selected model fails with a clear configuration error. Model ids are
discovered at runtime from the provider's live listing (`owlie models`), never
from a hardcoded allowlist. DeepSeek documents a `deepseek-chat` default;
OpenAI has no default model. If a configured default model no longer exists,
the failure points to `owlie models --provider <provider>` for the current list;
Owlie never silently substitutes a different model.

## Hosted mode

`--hosted` makes a single invocation deterministic for a hosted subprocess: it
accepts command-line flags and injected process environment only. It disables
`.env`/`.env.local`, `--env-file` (combining it with `--hosted` is a usage
error), saved user configuration, and model-cache fallback. `owlie auth` and
`owlie setup` are rejected (usage error 2) before prompting or writing state.

Hosted precedence is simply:

```text
command-line flags
    ↓
process environment variables
```

No filesystem configuration is consulted. `owlie doctor --json` reports
`configurationSource: "hosted"`; non-hosted invocations report `"local"` and
retain the full precedence documented above.

## Environment files

`--env-file /path/to/credentials.env` loads an explicit environment file, and
takes precedence over `.env.local` and `.env`. `.env.example` documents empty,
supported provider variables. Never commit real credentials.

## User configuration

`owlie setup` writes the selected provider and a provider-keyed profile to a
JSON file in the platform-appropriate config directory (XDG-aware):
`~/.config/owlie/config.json` on macOS/Linux, written with `0600` permissions.
`owlie auth add|list|remove <provider>` manages the same stored API keys outside
setup: `add` prompts for and stores a key, `list` reports the effective source
(environment or stored, never the key), and `remove` deletes a stored key.

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
and environment variables), so `--model` and the provider-specific variables
still override them. The API key and proxy credentials are never echoed to the
terminal; they are only written to the config file. Model lists are cached for
one hour at `~/.cache/owlie/models.json` (see `owlie models`).

## Transcription defaults

Direct-media transcription uses local faster-whisper. `owlie setup` offers a
Transcription section that checks Python 3 with the `faster_whisper` module,
ffmpeg, and ffprobe, then persists one of `tiny`, `base`, `small`, `medium`,
`large-v3`, or `large-v3-turbo` (default `small`). It never installs tools or
model weights. The selected model must be pre-provisioned locally: extraction
uses local-files-only model resolution and fails with guidance rather than
downloading missing weights. The saved shape is:

```yaml
transcription:
  provider: whisper-local
  model: small
  # Language, device, and compute type use provider defaults: auto/auto/int8.
```

## What is not required

No Owlie account, user ID, server, Postgres, R2, Stripe, or hosted credits.
There is no secrets vault.
