/**
 * Provider-neutral media-type vocabulary for interpreting a fetched
 * `Content-Type` header. Every predicate is pure and returns `false` for a
 * missing or empty declaration, so a call site that must accept a missing
 * declaration (for example RSS feed compatibility) opts in at its own gate
 * rather than relying on a permissive classifier.
 */

/**
 * Extracts the media type (the part before any `;` parameters) from a declared
 * `Content-Type` header value, trimmed and lowercased. Returns `undefined` for
 * a missing, empty, or parameter-only declaration.
 */
export function mediaTypeOf(contentType: string | null | undefined): string | undefined {
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType ? mediaType : undefined;
}

/** Whether the declared media type is HTML or XHTML. */
export function isHtmlContentType(contentType: string | null | undefined): boolean {
  const mediaType = mediaTypeOf(contentType);
  return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
}

/** Whether the declared media type is JSON, JSON-LD, or any `+json` media type. */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  const mediaType = mediaTypeOf(contentType);
  return (
    mediaType === 'application/json' ||
    mediaType === 'application/ld+json' ||
    (mediaType?.endsWith('+json') ?? false)
  );
}

/** Whether the declared media type is an RSS/Atom/XML feed or any `+xml` media type. */
export function isFeedContentType(contentType: string | null | undefined): boolean {
  const mediaType = mediaTypeOf(contentType);
  return (
    mediaType === 'application/rss+xml' ||
    mediaType === 'application/atom+xml' ||
    mediaType === 'application/xml' ||
    mediaType === 'text/xml' ||
    (mediaType?.endsWith('+xml') ?? false)
  );
}
