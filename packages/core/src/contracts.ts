import type { ProgressEvent } from './progress.js';
import type {
  ContentCollection,
  ContentItem,
  ContentLocator,
  ModelInfo,
  NormalizedDocument,
  ProcessRequest,
  ProcessResult,
  SourceType,
} from './types.js';
import type { OutputFormat } from './output.js';
import type { HttpFetchPolicy, HttpTextResponse } from './http.js';

/** A sink for provider-neutral progress events. */
export interface ProgressSink {
  emit(event: ProgressEvent): void;
}

/** Options shared by extraction-style operations. */
export interface ExtractionOptions {
  signal?: AbortSignal;
  progress?: ProgressSink;
  /** CLI-boundary extraction timestamp shared by every adapter attempt. */
  fetchedAt?: string;
}

/** Options shared by item-resolution operations. */
export interface ResolutionOptions {
  signal?: AbortSignal;
}

/**
 * The minimal capability every source adapter shares: it can say whether it
 * recognizes a locator.
 */
export interface SourceAdapter {
  readonly id: string;
  readonly sourceType: SourceType;
  recognize(locator: ContentLocator): boolean;
}

export interface CollectionListOptions {
  limit: number;
  sort?: string;
  period?: string;
  signal?: AbortSignal;
}

export interface CollectionListResult {
  collection: ContentCollection;
  items: ContentItem[];
  truncated: boolean;
}

/**
 * Adapter for a collection of items (a YouTube playlist, a subreddit, or an
 * RSS/Atom feed). It recognizes a locator, resolves it into a canonical
 * collection, and lists bounded items with stable identities.
 */
export interface CollectionAdapter extends SourceAdapter {
  resolve(locator: ContentLocator): Promise<ContentCollection>;
  list(
    collection: ContentCollection,
    options: CollectionListOptions,
  ): Promise<CollectionListResult>;
}

/**
 * Adapter for a single item (a YouTube video, a podcast episode, a Reddit
 * post, or an RSS/Atom entry). It resolves an item and extracts it into a
 * {@link NormalizedDocument}.
 */
export interface ItemAdapter extends SourceAdapter {
  resolveItem?(locator: ContentLocator, options?: ResolutionOptions): Promise<ContentItem>;
  extract(item: ContentItem, options?: ExtractionOptions): Promise<NormalizedDocument>;
}

/**
 * Internal fallback seam (not part of the public {@link ItemAdapter}
 * contract): an item adapter that can consume an already safe-fetched
 * {@link HttpTextResponse} instead of re-fetching it. Dispatch uses this when
 * a recognizing adapter defers via {@link NotHandledError} carrying a deferred
 * response, avoiding a duplicate request (for example the generic episode-page
 * resolver defers to the article adapter).
 */
export interface DeferredResponseItemAdapter {
  extractDeferred(
    item: ContentItem,
    response: HttpTextResponse,
    options?: ExtractionOptions,
  ): Promise<NormalizedDocument>;
}

/**
 * Reusable extraction strategy. An item adapter may implement extraction
 * directly or delegate to a shared {@link ContentExtractor} (for example, the
 * Reddit adapter reuses RSS/Atom parsing from the RSS adapter).
 */
export interface ContentExtractor {
  readonly id: string;
  readonly sourceType: SourceType;
  extract(item: ContentItem, options?: ExtractionOptions): Promise<NormalizedDocument>;
}

/** Discovers collections reachable from a locator (reserved for future use). */
export interface CollectionDiscovery {
  readonly id: string;
  discover(locator: ContentLocator): Promise<ContentCollection[]>;
}

export interface TranscriptionInput {
  mediaUrl?: string;
  mediaPath?: string;
  language?: string;
  metadata: Record<string, unknown>;
}

export interface TranscriptionOptions {
  model?: string;
  language?: string;
  computeType?: string;
  signal?: AbortSignal;
  progress?: ProgressSink;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  segments?: TranscriptionSegment[];
  metadata: Record<string, unknown>;
}

/** A provider-neutral transcriber. The intended first provider is local faster-whisper. */
export interface Transcriber {
  readonly id: string;
  transcribe(
    input: TranscriptionInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}

export interface ProcessorOptions {
  signal?: AbortSignal;
  progress?: ProgressSink;
}

/** A provider-neutral LLM content processor. */
export interface ContentProcessor {
  readonly id: string;
  process(request: ProcessRequest, options?: ProcessorOptions): Promise<ProcessResult>;
}

/** Options for a live model-catalog discovery call. */
export interface ProviderCatalogOptions {
  signal?: AbortSignal;
  policy?: HttpFetchPolicy;
}

/**
 * A provider-neutral live model catalog. Implemented by each LLM provider
 * package; generation remains in {@link ContentProcessor}. It stays SDK-free:
 * no OpenAI/DeepSeek model names, SDK types, or environment loading. The CLI
 * resolves the effective credential and passes an explicit
 * `{ apiKey, baseUrl }` object.
 */
export interface ProviderCatalog {
  readonly providerId: string;
  listModels(
    credentials: { apiKey: string; baseUrl?: string },
    options?: ProviderCatalogOptions,
  ): Promise<ModelInfo[]>;
}

export interface SerializeOptions {
  pretty?: boolean;
}

/** Serializes a result into one of the reserved output formats. */
export interface OutputSerializer {
  readonly id: string;
  readonly format: OutputFormat;
  serialize(value: unknown, options?: SerializeOptions): string;
}
