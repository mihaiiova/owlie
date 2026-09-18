import type { ProgressEvent } from './progress.js';

/**
 * Schema version of the JSON subprocess protocol. This evolves independently
 * from package SemVer: additive fields are compatible within a package major;
 * incompatible changes increment this number.
 */
export const JSON_PROTOCOL_SCHEMA_VERSION = 1 as const;

/** The literal values {@link JSON_PROTOCOL_SCHEMA_VERSION} may take. */
export type JsonProtocolSchemaVersion = typeof JSON_PROTOCOL_SCHEMA_VERSION;

/**
 * Base identity shared by every versioned JSON protocol record. Consumers can
 * always read `schemaVersion` and `command` before dispatching on the rest.
 */
export interface ProtocolRecord {
  schemaVersion: JsonProtocolSchemaVersion;
  command: string;
}

/**
 * The single-result stdout envelope written by successful commands in
 * `--json` mode: `{ schemaVersion, command, result }`. The command-defined
 * result stays nested under `result` (including feed-batch semantics).
 */
export interface ProtocolResultEnvelope<T = unknown> extends ProtocolRecord {
  result: T;
}

/** A versioned stderr progress record carrying an existing `ProgressEvent`. */
export interface ProtocolProgressRecord extends ProtocolRecord {
  kind: 'progress';
  event: ProgressEvent;
}

/** A terminal stderr record for a structured failure. */
export interface ProtocolErrorRecord extends ProtocolRecord {
  kind: 'error';
  /** Stable consumer-facing error code from the closed protocol taxonomy. */
  code: string;
  /** Redacted safe diagnostic (no secrets, URL userinfo, query, or fragment). */
  message: string;
}

/** A terminal stderr record for cancellation. */
export interface ProtocolCancelledRecord extends ProtocolRecord {
  kind: 'cancelled';
  message: string;
}

/** Any versioned stderr record the CLI may write in `--json` mode. */
export type ProtocolStderrRecord =
  ProtocolProgressRecord | ProtocolErrorRecord | ProtocolCancelledRecord;
