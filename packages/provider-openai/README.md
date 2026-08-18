# @owlieio/provider-openai

OpenAI content processor provider for Owlie CLI.

This is a non-functional scaffold: it defines the public configuration type and
an explicit entry point, but never makes network calls. The `ContentProcessor`
contract lives in `@owlieio/core`; this package supplies the OpenAI-specific
configuration and implementation surface.

## Configuration

The provider receives an explicit configuration object — it never reads
environment variables itself:

```ts
import { OpenAIProcessor } from '@owlieio/provider-openai';

const processor = new OpenAIProcessor({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
});
```

## What is implemented

- `OpenAIConfig` type.
- `validateOpenAIConfig` — checks that an API key is present.
- `OpenAIProcessor` — implements `ContentProcessor`; `process` throws
  `NotImplementedError`.

## Dependency rules

May depend only on `@owlieio/core`. No adapters, no CLI, no hosted code, no
environment-variable loading.

## Development

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```
