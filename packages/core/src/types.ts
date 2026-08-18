/**
 * Provider-neutral domain types for Owlie CLI.
 *
 * These types are the shared vocabulary for every adapter, provider, and the
 * CLI. They must never expose SDK-specific types from OpenAI, Whisper, RSS
 * libraries, or any other provider.
 */

/** The kind of source a locator, collection, item, or document came from. */
export type SourceType = 'youtube' | 'podcast' | 'reddit' | 'rss';

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

/** A source-agnostic, normalized representation of extracted content. */
export interface NormalizedDocument {
  schemaVersion: 1;
  id: string;
  sourceType: SourceType;
  canonicalUrl: string;
  mediaType: MediaType;
  title?: string;
  text: string;
  publishedAt?: string;
  author?: string;
  metadata: Record<string, unknown>;
}

/** A request to process a normalized document with an LLM. */
export interface ProcessRequest {
  document: NormalizedDocument;
  instruction?: string;
  outputSchema?: Record<string, unknown>;
}

/** The result of processing a document. */
export interface ProcessResult {
  output: string;
  format: 'text' | 'markdown' | 'json';
  metadata: Record<string, unknown>;
}
