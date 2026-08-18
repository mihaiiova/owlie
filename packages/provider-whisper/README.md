# @owlieio/provider-whisper

Local transcription provider for Owlie CLI, backed by
[faster-whisper](https://github.com/SYSTRAN/faster-whisper).

This is a non-functional scaffold: it defines the public configuration type and
an explicit entry point, but never installs or invokes faster-whisper.

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

## Requirements (documented, not installed)

Local transcription will require:

- `ffmpeg` and `ffprobe` on `PATH`;
- Python 3 with the `faster-whisper` package;
- sufficient local compute for the selected model.

`owlie doctor` reports availability of these dependencies.

## What is implemented

- `WhisperLocalConfig` type and defaults.
- `WhisperLocalTranscriber` — implements `Transcriber`; `transcribe` throws
  `NotImplementedError`.

## Dependency rules

May depend only on `@owlieio/core`. No adapters, no CLI, no hosted code.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
