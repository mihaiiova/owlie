# @owlieio/provider-deepseek

DeepSeek content processor provider for Owlie CLI.

Implements the provider-neutral `ContentProcessor` contract using the `ai` SDK
and `@ai-sdk/deepseek`. Configuration is an explicit object; the package never
reads environment variables and never logs or serializes the API key.

## Configuration

```ts
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';

const processor = new DeepSeekProcessor({
  apiKey: 'sk-...',
  // baseUrl, model, timeoutMs are optional
});

const result = await processor.process({
  document,
  instruction: 'Summarize this',
});
```

- Default model: `deepseek-chat` (also supports `deepseek-reasoner`).
- `baseUrl` maps to the DeepSeek API base URL (the SDK default is used when
  omitted).
- `timeoutMs` is passed to the SDK as the request timeout.

## Typed failures

- `ConfigurationError` — missing/blank API key.
- `CancelledError` — abort signal or SDK abort.
- `ProcessingError` — any other SDK failure (translated, never leaking the key).

## Dependency rules

Depends only on `@owlieio/core` (plus the `ai` and `@ai-sdk/deepseek` SDKs).
No adapters, no CLI, no hosted code, no environment-variable loading.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
