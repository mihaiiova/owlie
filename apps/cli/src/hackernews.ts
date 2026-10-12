import type {
  ExtractionWarning,
  ItemAdapter,
  NormalizedDocument,
  ProgressSink,
} from '@owlieio/core';
import { buildProvenance, CancelledError } from '@owlieio/core';
import {
  HackerNewsAdapter,
  hackerNewsItemId,
  renderDiscussion,
  storyMetadata,
  type HackerNewsStory,
} from '@owlieio/adapter-hackernews';
import type { HackerNewsContent } from './cli.js';
import { extractWithFallback } from './dispatch.js';
import { redactUrls } from './protocol.js';
import { finalizeDocument } from './provenance.js';

/** Warning when an item has no linked article (a text post). */
export const HN_NO_LINKED_ARTICLE_CODE = 'HN_NO_LINKED_ARTICLE';
/** Warning when `both` could not read the linked article and kept the discussion. */
export const HN_ARTICLE_UNAVAILABLE_CODE = 'HN_ARTICLE_UNAVAILABLE';

export interface HackerNewsExtractionInput {
  url: string;
  mode: HackerNewsContent;
  adapter: HackerNewsAdapter;
  /** The article adapter(s) used for the linked article (`--article` rules). */
  articleAdapters: readonly ItemAdapter[];
  signal?: AbortSignal;
  progress?: ProgressSink;
  clock?: () => Date;
}

/** Whether an item adapter is the Hacker News adapter. */
export function isHackerNewsAdapter(adapter: ItemAdapter): adapter is HackerNewsAdapter {
  return adapter instanceof HackerNewsAdapter;
}

/**
 * Extracts a Hacker News item as its discussion, its linked article, or both
 * in one document (article first). The adapter produces the discussion; the
 * linked article goes through the article adapter here, at the CLI, because
 * adapters do not depend on each other. In `both`, an unreadable article keeps
 * the discussion with a warning; in `article`, it fails.
 */
export async function extractHackerNewsItem(
  input: HackerNewsExtractionInput,
): Promise<NormalizedDocument> {
  const fetchedAt = (input.clock?.() ?? new Date()).toISOString();
  const clock = () => new Date(fetchedAt);
  const { adapter, signal, progress } = input;
  const item = await adapter.resolveItem({ url: input.url }, { signal });

  if (input.mode === 'discussion') {
    const discussion = await adapter.extract(item, { signal, progress, fetchedAt });
    return finalizeDocument(discussion, { adapterId: adapter.id, fetchedAt });
  }

  const readArticle = (url: string) =>
    extractWithFallback(input.articleAdapters, { url }, { signal, progress, clock });

  if (input.mode === 'article') {
    const story = await adapter.fetchStory(item, { signal });
    if (story.linkUrl === undefined) {
      return composeDocument(story, renderDiscussion(story, []), fetchedAt, {
        mode: 'article',
        warnings: [noLinkedArticleWarning()],
      });
    }
    const { document: article } = await readArticle(story.linkUrl);
    return composeDocument(story, article.text, fetchedAt, {
      mode: 'article',
      article,
      warnings: article.provenance.warnings,
    });
  }

  const discussion = await adapter.extract(item, { signal, progress, fetchedAt });
  const story = storyFromDiscussion(discussion);
  const comments = {
    commentsIncluded: discussion.metadata.commentsIncluded,
    commentsOmitted: discussion.metadata.commentsOmitted,
  };
  if (story.linkUrl === undefined) {
    return composeDocument(story, discussion.text, fetchedAt, {
      mode: 'both',
      comments,
      warnings: [...discussion.provenance.warnings, noLinkedArticleWarning()],
    });
  }
  try {
    const { document: article } = await readArticle(story.linkUrl);
    return composeDocument(
      story,
      `# Article\n\n${article.text}\n\n# Discussion\n\n${discussion.text}`,
      fetchedAt,
      {
        mode: 'both',
        article,
        comments,
        warnings: [...article.provenance.warnings, ...discussion.provenance.warnings],
      },
    );
  } catch (error) {
    if (error instanceof CancelledError || signal?.aborted) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return composeDocument(story, discussion.text, fetchedAt, {
      mode: 'both',
      comments,
      warnings: [
        ...discussion.provenance.warnings,
        {
          code: HN_ARTICLE_UNAVAILABLE_CODE,
          message: redactUrls(`linked article could not be read, discussion kept: ${reason}`),
        },
      ],
    });
  }
}

function noLinkedArticleWarning(): ExtractionWarning {
  return {
    code: HN_NO_LINKED_ARTICLE_CODE,
    message: 'the item has no linked article; its own text is used',
  };
}

/** Rebuilds the story facts from a discussion document's metadata. */
function storyFromDiscussion(discussion: NormalizedDocument): HackerNewsStory {
  const metadata = discussion.metadata;
  const story: HackerNewsStory = {
    hnId: metadata.hnId as number,
    kind: metadata.kind as HackerNewsStory['kind'],
    title: discussion.title ?? discussion.id,
    hnUrl: discussion.canonicalUrl,
    commentIds: [],
  };
  if (typeof metadata.linkUrl === 'string') story.linkUrl = metadata.linkUrl;
  if (typeof metadata.score === 'number') story.score = metadata.score;
  if (typeof metadata.commentCount === 'number') story.commentCount = metadata.commentCount;
  if (discussion.author) story.author = discussion.author;
  if (discussion.publishedAt) story.publishedAt = discussion.publishedAt;
  return story;
}

function composeDocument(
  story: HackerNewsStory,
  text: string,
  fetchedAt: string,
  options: {
    mode: HackerNewsContent;
    article?: NormalizedDocument;
    comments?: Record<string, unknown>;
    warnings: readonly ExtractionWarning[];
  },
): NormalizedDocument {
  const metadata: Record<string, unknown> = {
    ...storyMetadata(story),
    hnContent: options.mode,
    ...(options.comments ?? {}),
  };
  if (options.article) {
    metadata.article = {
      canonicalUrl: options.article.canonicalUrl,
      ...(options.article.title ? { title: options.article.title } : {}),
    };
  }
  const document: NormalizedDocument = {
    schemaVersion: 2,
    id: hackerNewsItemId(story.hnId),
    sourceType: 'hackernews',
    canonicalUrl: story.hnUrl,
    mediaType: 'text',
    title: story.title,
    text,
    ...(story.publishedAt ? { publishedAt: story.publishedAt } : {}),
    ...(story.author ? { author: story.author } : {}),
    metadata,
    provenance: buildProvenance({
      sourceId: hackerNewsItemId(story.hnId),
      canonicalUrl: story.hnUrl,
      adapterId: HackerNewsAdapter.id,
      text,
      fetchedAt,
    }),
  };
  return finalizeDocument(document, {
    adapterId: HackerNewsAdapter.id,
    fetchedAt,
    warnings: options.warnings,
  });
}
