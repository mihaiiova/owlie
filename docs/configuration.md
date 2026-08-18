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

Environment-file loading belongs only to `@owlieio/cli`. Core, adapters, and
providers receive explicit configuration objects and never read environment
variables themselves.

## Environment files

`--env-file /path/to/credentials.env` is reserved for an explicit environment
file. `.env.example` documents empty, supported provider variables. Never
commit real credentials.

## User configuration

The configuration file will eventually live in the platform-appropriate config
directory (XDG-aware): `~/.config/owlie` on macOS/Linux.

## Transcription defaults

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
