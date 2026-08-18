import { ConfigurationError } from './errors.js';

/**
 * Bounds for collection operations. Owlie never performs an unbounded
 * "process everything" operation.
 */
export const DEFAULT_COLLECTION_LIMIT = 10;
export const MAX_COLLECTION_LIMIT = 500;

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validates that a limit is a positive integer within the configured maximum.
 * Throws {@link ConfigurationError} for invalid or unbounded values.
 */
export function assertBoundedLimit(value: unknown, options: { max?: number } = {}): number {
  if (!isPositiveInteger(value)) {
    throw new ConfigurationError(`limit must be a positive integer, received ${String(value)}`);
  }
  const max = options.max ?? MAX_COLLECTION_LIMIT;
  if (value > max) {
    throw new ConfigurationError(`limit ${value} exceeds the maximum allowed limit of ${max}`);
  }
  return value;
}

/**
 * Resolves a possibly-absent limit to a valid bounded value, using the
 * conservative default of {@link DEFAULT_COLLECTION_LIMIT} when absent.
 */
export function resolveLimit(value: unknown, options: { max?: number } = {}): number {
  if (value === undefined || value === null) {
    return DEFAULT_COLLECTION_LIMIT;
  }
  return assertBoundedLimit(value, options);
}
