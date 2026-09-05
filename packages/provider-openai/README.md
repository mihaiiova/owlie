# @owlieio/provider-openai

OpenAI content processor provider for Owlie CLI.

A functional `ContentProcessor` implemented with `ai` and `@ai-sdk/openai`,
mirroring the DeepSeek provider's prompt construction, cancellation/error
mapping, timeout/signal forwarding, and JSON-format behavior. The
`ContentProcessor` contract lives in `@owlieio/core`; this package supplies the
OpenAI-specific client, configuration, and error mapping.

## Configuration

The provider receives an explicit configuration object — it never reads
environment variables itself (only the CLI loads them):

```ts
import { OpenAIProcessor } from '@owlieio/provider-openai';

const processor = new OpenAIProcessor({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
});
```

There is no default OpenAI model: the `model` selected by setup, environment,
or `--model` is required for processing, and a missing model raises a
`ConfigurationError`.

## What is implemented

- `OpenAIConfig` type (`apiKey`, optional `baseUrl`, `model`, `timeoutMs`).
- `validateOpenAIConfig` — checks that an API key is present.
- `OpenAIProcessor` — implements `ContentProcessor`; returns a `ProcessResult`
  with `{ provider, model, usage }` metadata (normalized token usage when the
  API reports it). Aborted signals map to `CancelledError` and SDK failures to
  `ProcessingError`; the API key is never serialized or logged.
- `OpenAIClient` seam and `createDefaultOpenAIClient` — the generation client
  can be injected for offline tests.

## Dependency rules

Depends on `@owlieio/core` (provider-neutral contracts) plus the generic
`ai`/`@ai-sdk/openai` SDK once functional. No adapters, no CLI, no hosted code,
no environment-variable loading.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
