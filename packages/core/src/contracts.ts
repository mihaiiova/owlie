import type { ProgressEvent } from './progress.js';
import type {
  ContentCollection,
  ContentItem,
  ContentLocator,
  NormalizedDocument,
  ProcessRequest,
  ProcessResult,
  SourceType,
} from './types.js';
import type { OutputFormat } from './output.js';

/** A sink for provider-neutral progress events. */
export interface ProgressSink {
  emit(event: ProgressEvent): void;
}

/** Options shared by extraction-style operations. */
export interface ExtractionOptions {
  signal?: AbortSignal;
  progress?: ProgressSink;
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
  resolveItem?(locator: ContentLocator): Promise<ContentItem>;
  extract(item: ContentItem, options?: ExtractionOptions): Promise<NormalizedDocument>;
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

export interface SerializeOptions {
  pretty?: boolean;
}

/** Serializes a result into one of the reserved output formats. */
export interface OutputSerializer {
  readonly id: string;
  readonly format: OutputFormat;
  serialize(value: unknown, options?: SerializeOptions): string;
}
