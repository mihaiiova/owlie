import type { ProcessRequest, ProcessResult } from './types.js';
import { CancelledError, ProcessingError } from './errors.js';

/**
 * Provider-neutral token usage, normalized from an SDK result into the shared
 * `{ inputTokens, outputTokens, totalTokens }` metadata convention. No
 * SDK-specific fields survive normalization.
 */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Renders the provider-neutral prompt for an LLM processing request: the
 * instruction (when present), an optional JSON schema directive, and the
 * document text, joined by blank lines and trimmed.
 */
export function renderPrompt(request: ProcessRequest): string {
  const parts: string[] = [];
  const instruction = request.instruction?.trim();
  if (instruction) parts.push(instruction);
  if (request.outputSchema) {
    parts.push(
      'Respond with JSON that matches this schema: ' + JSON.stringify(request.outputSchema),
    );
  }
  parts.push(request.document.text.trim());
  return parts.join('\n\n').trim();
}

/** Classifies an SDK/abort failure as an abort without importing SDK types. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Reduces an SDK usage object to the three provider-neutral token fields. */
export function normalizeUsage(usage: TokenUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

/**
 * Builds the provider-neutral {@link ProcessResult} from an SDK text response,
 * selecting `json` when the request declared an output schema and otherwise
 * `text`, and recording `{ provider, model, usage }` metadata.
 */
export function buildProcessResult(options: {
  output: string;
  provider: string;
  model: string;
  usage?: TokenUsage;
  outputSchema?: Record<string, unknown>;
}): ProcessResult {
  const metadata: Record<string, unknown> = { provider: options.provider, model: options.model };
  const usage = normalizeUsage(options.usage);
  if (usage) metadata.usage = usage;
  return {
    output: options.output,
    format: options.outputSchema ? 'json' : 'text',
    metadata,
  };
}

/**
 * Redacts secret values and bearer-token shapes from a message so a
 * provider-SDK failure can be surfaced without leaking credentials or request
 * metadata. Exact secret values are replaced first; a `Bearer <token>` shape
 * is redacted defensively even when the exact token is unknown.
 */
export function redactSecrets(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const secret of secrets) {
    const value = secret.trim();
    if (value) out = out.split(value).join('[REDACTED]');
  }
  return out.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

/**
 * Maps an SDK/abort failure to the shared error convention: an aborted signal
 * or `AbortError` becomes a {@link CancelledError}, and any other failure
 * becomes a {@link ProcessingError} prefixed with the caller-supplied label.
 * Any supplied `secrets` (for example the provider API key) are redacted from
 * the surfaced message. Always throws; the return type is `never`.
 */
export function mapProcessingError(
  label: string,
  error: unknown,
  signal?: AbortSignal,
  secrets: readonly string[] = [],
): never {
  if (signal?.aborted || isAbortError(error)) {
    throw new CancelledError(`${label} processing was cancelled`, { cause: error });
  }
  const raw = error instanceof Error ? error.message : String(error);
  throw new ProcessingError(`${label} processing failed: ${redactSecrets(raw, secrets)}`, {
    cause: error,
  });
}
