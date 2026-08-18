import type { ContentItem } from './types.js';

/**
 * Provider-neutral progress events. The `type` field discriminates the union.
 * Consumers (the CLI, tests) can switch exhaustively on `type`.
 */
export type ProgressEvent =
  | { type: 'started'; target: string }
  | { type: 'progress'; target: string; current: number; total?: number; message?: string }
  | { type: 'item'; target: string; item: ContentItem }
  | { type: 'completed'; target: string; result?: unknown }
  | { type: 'failed'; target: string; error: string }
  | { type: 'cancelled'; target: string };
