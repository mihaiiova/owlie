/**
 * Provider-neutral domain types for Owlie CLI.
 *
 * These types are the shared vocabulary for every adapter, provider, and the
 * CLI. They must never expose SDK-specific types from OpenAI, Whisper, RSS
 * libraries, or any other provider.
 */

/** The kind of source a locator, collection, item, or document came from. */
export type SourceType = 'youtube' | 'podcast' | 'reddit' | 'rss' | 'article' | 'local';

/** Every {@link SourceType} value, kept as the single runtime source of truth. */
export const SOURCE_TYPES = ['youtube', 'podcast', 'reddit', 'rss', 'article', 'local'] as const;

/** Whether a runtime value is a valid {@link SourceType}. */
export function isSourceType(value: unknown): value is SourceType {
  return typeof value === 'string' && (SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * The kind of media a normalized document contains. Not every document is a
 * transcript: YouTube and podcast documents may contain transcripts, while
 * Reddit and RSS documents contain normalized written text.
 */
export type MediaType = 'text' | 'transcript' | 'mixed';

/** A user-supplied reference to a source, possibly with a disambiguating hint. */
export interface ContentLocator {
  url: string;
  hint?: string;
}

/** A canonical, stable reference to a collection of items. */
export interface ContentCollection {
  id: string;
  sourceType: SourceType;
  canonicalUrl: string;
  title?: string;
  metadata: Record<string, unknown>;
}

/** A single item that belongs to a collection. */
export interface ContentItem {
  id: string;
  sourceType: SourceType;
  canonicalUrl: string;
  title?: string;
  description?: string;
  publishedAt?: string;
  author?: string;
  metadata: Record<string, unknown>;
}

export const NORMALIZED_DOCUMENT_SCHEMA_VERSION = 2 as const;

/** The literal values {@link NORMALIZED_DOCUMENT_SCHEMA_VERSION} may take. */
export type NormalizedDocumentSchemaVersion = typeof NORMALIZED_DOCUMENT_SCHEMA_VERSION;

/** A deterministic SHA-256 content fingerprint of normalized document text. */
export interface ContentFingerprint {
  algorithm: 'sha256';
  digest: string;
}

/** A structured, machine-readable extraction warning with a stable code. */
export interface ExtractionWarning {
  code: string;
  message: string;
}

/**
 * First-class extraction provenance attached to every v2
 * {@link NormalizedDocument}. It records the stable source identity, canonical
 * URL, producing adapter, optional resolver, CLI-boundary timestamp, language,
 * deterministic content fingerprint, and structured warnings. Values must not
 * expose credentials, URL userinfo, query strings, or fragments.
 */
export interface DocumentProvenance {
  /** Stable idempotency identity, distinct from the text fingerprint. */
  sourceId: string;
  canonicalUrl: string;
  /** The adapter that produced the document. */
  adapterId: string;
  /** The selected audio resolver, when resolver extraction produced it. */
  resolverId?: string;
  /** ISO-8601 UTC extraction timestamp stamped once at the CLI boundary. */
  fetchedAt: string;
  /** Normalized transcript language when available. */
  language?: string;
  contentFingerprint: ContentFingerprint;
  warnings: ExtractionWarning[];
}

/** A source-agnostic, normalized representation of extracted content. */
export interface NormalizedDocument {
  schemaVersion: NormalizedDocumentSchemaVersion;
  id: string;
  sourceType: SourceType;
  canonicalUrl: string;
  mediaType: MediaType;
  title?: string;
  text: string;
  publishedAt?: string;
  author?: string;
  metadata: Record<string, unknown>;
  provenance: DocumentProvenance;
}

/** A request to process a normalized document with an LLM. */
export interface ProcessRequest {
  document: NormalizedDocument;
  instruction?: string;
  outputSchema?: Record<string, unknown>;
}

/**
 * The single-result output format carried by a {@link ProcessResult}. This is
 * distinct from the reserved {@link OutputFormat} serializer vocabulary, whose
 * `jsonl` member is a streaming/serialization format and never a single-result
 * format.
 */
export type ProcessResultFormat = 'text' | 'markdown' | 'json';

/** The result of processing a document. */
export interface ProcessResult {
  output: string;
  format: ProcessResultFormat;
  metadata: Record<string, unknown>;
}

/**
 * A single model offered by an LLM provider, normalized from the provider's
 * live listing. `capabilities` fields are all optional and normalized only
 * from what the provider actually returns; Owlie never guesses them from model
 * names.
 */
export interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
  capabilities?: { reasoning?: boolean; vision?: boolean; tools?: boolean };
}
