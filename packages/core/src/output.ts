/**
 * The reserved output-format vocabulary for the {@link OutputSerializer}
 * contract. `jsonl` is a streaming/serialization format and is never a
 * single-result format — a single {@link ProcessResult} uses
 * {@link ProcessResultFormat} instead.
 */
export type OutputFormat = 'text' | 'markdown' | 'json' | 'jsonl';
