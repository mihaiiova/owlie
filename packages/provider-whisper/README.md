# @owlieio/provider-whisper

Local transcription provider for Owlie CLI, backed by
[faster-whisper](https://github.com/SYSTRAN/faster-whisper).

The provider invokes locally installed faster-whisper through Python, and
ffprobe/ffmpeg, using argument arrays only. It never installs tools, packages,
or model weights.

## Configuration

The provider receives an explicit configuration object — it never reads
environment variables itself. Intended defaults:

```yaml
transcription:
  provider: whisper-local
  model: small
  language: auto
  computeType: int8
```

```ts
import { WhisperLocalTranscriber } from '@owlieio/provider-whisper';

const transcriber = new WhisperLocalTranscriber({
  model: 'small',
  language: 'auto',
  computeType: 'int8',
});
```

## Requirements (detected, not installed)

Local transcription requires:

- `ffmpeg` and `ffprobe` on `PATH`;
- Python 3 with the `faster-whisper` package;
- sufficient local compute for the selected model.

`owlie doctor` reports availability of these dependencies.

## What is implemented

- `WhisperLocalConfig` type and defaults.
- `WhisperLocalTranscriber` — probes/transcodes audio, invokes faster-whisper,
  and returns text plus optional segment timing. It cleans intermediate files
  and honors cancellation.

## Dependency rules

May depend only on `@owlieio/core`. No adapters, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
