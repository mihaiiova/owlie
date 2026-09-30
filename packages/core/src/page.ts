/**
 * Pure page-type declarations shared by adapters that must agree on what a
 * page says it is (the article adapter classifies with it; the podcast
 * episode-page resolver defers declared articles). Input is HTML already
 * validated as HTML by the caller; nothing is fetched.
 */

/** JSON-LD `@type` values that declare a page to be an article. */
const ARTICLE_JSON_LD_TYPES = new Set([
  'article',
  'newsarticle',
  'blogposting',
  'report',
  'scholarlyarticle',
  'techarticle',
]);

/** How a page declares its own type. */
export type DeclaredArticleSignal = 'og-article' | 'json-ld-article' | 'og-non-article' | 'none';

function metaAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function ogType(html: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = metaAttributes(match[0]);
    if (attrs.property?.toLowerCase() === 'og:type' && attrs.content !== undefined) {
      return attrs.content.trim().toLowerCase();
    }
  }
  return undefined;
}

function hasArticleJsonLdType(node: unknown, depth = 0): boolean {
  if (depth > 8 || node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((entry) => hasArticleJsonLdType(entry, depth + 1));
  const record = node as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (
    types.some((type) => typeof type === 'string' && ARTICLE_JSON_LD_TYPES.has(type.toLowerCase()))
  )
    return true;
  return hasArticleJsonLdType(record['@graph'], depth + 1);
}

/**
 * Reads how a page declares itself: `og:type` first, then JSON-LD `@type`
 * (including `@graph` and `@type` arrays). Pure; malformed JSON-LD blocks are
 * skipped.
 */
export function declaredArticleSignal(html: string): DeclaredArticleSignal {
  const og = ogType(html);
  if (og === 'article') return 'og-article';
  for (const script of html.matchAll(
    /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      if (hasArticleJsonLdType(JSON.parse(script[2] ?? ''))) return 'json-ld-article';
    } catch {
      // A malformed publisher block must not prevent later declarations.
    }
  }
  return og === undefined ? 'none' : 'og-non-article';
}
