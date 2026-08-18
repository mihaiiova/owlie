# Adding a provider

Providers implement `ContentProcessor` (LLM) or `Transcriber` (transcription).

## Steps

1. Create `packages/provider-<name>/` with the standard package layout.
2. Depend only on `@owlieio/core`.
3. Define a public configuration type; receive it as an explicit object and
   never read environment variables.
4. Implement `id` and the contract method. During scaffolding, the method
   throws `NotImplementedError` and never makes network calls.
5. Add configuration-validation unit tests.
6. Wire the `processorContract` / `transcriberContract` helpers once real
   behavior exists.
7. Add a fake to `@owlieio/testing` so consumers can test against it.
8. Update the README, dependency map, and any affected docs/ADRs.

## Checklist

- Only `@owlieio/core` as a dependency.
- No SDK-specific types in `@owlieio/core`.
- No environment-variable loading in the provider.
- No network calls or secret handling during scaffolding.
- For transcribers, document ffmpeg/ffprobe/Python requirements and enforce
  subprocess calls without shell interpolation when implemented.
