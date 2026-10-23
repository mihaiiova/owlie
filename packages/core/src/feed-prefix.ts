import {
  isFeedContentType,
  isHtmlContentType,
  isPdfContentType,
  startsWithPdfSignature,
} from './media-type.js';

/**
 * Incremental scanner that finds where a feed document can be cut after its
 * first `maxEntries` entries, so a listing can stop downloading a large feed
 * once it has what it needs.
 *
 * It tokenizes just enough XML to track open elements: comments, CDATA,
 * processing instructions and declarations are skipped, and attribute values
 * are quoted-aware. An entry is a top-level `item` (RSS 2.0, RSS 1.0) or
 * `entry` (Atom) element, matched by local name and not nested in another
 * entry. When entry `maxEntries + 1` starts, the document is cut just before
 * it and the still-open elements (e.g. `</channel></rss>`) are closed, which
 * yields a well-formed prefix the normal parser reads. The parser's safety
 * rules (no DTD or entities) still apply to the prefix.
 *
 * `scan` takes the whole text received so far (as a streaming fetch reports
 * it) and resumes where the previous call stopped, so chunk boundaries never
 * change the result.
 */
export class FeedEntryScanner {
  private position = 0;
  private readonly stack: string[] = [];
  private entryDepth: number | undefined;
  private entries = 0;
  private cut: { offset: number; closing: string } | undefined;

  constructor(private readonly maxEntries: number) {}

  /** Scans newly received text; `true` once the entry after the limit has started. */
  scan(text: string): boolean {
    while (this.cut === undefined) {
      const start = text.indexOf('<', this.position);
      if (start === -1) {
        this.position = text.length;
        return false;
      }
      const end = this.tokenEnd(text, start);
      if (end === undefined) {
        // An incomplete token: wait for more text.
        this.position = start;
        return false;
      }
      this.position = end;
      this.visit(text, start, end);
    }
    return true;
  }

  /**
   * The well-formed document prefix holding the first `maxEntries` entries,
   * or `undefined` when the text has no entry after them.
   */
  prefix(text: string): string | undefined {
    if (this.cut === undefined) return undefined;
    return text.slice(0, this.cut.offset).trimEnd() + this.cut.closing;
  }

  /** The offset just past the token starting at `start`, or `undefined` if incomplete. */
  private tokenEnd(text: string, start: number): number | undefined {
    const closer = (marker: string): number | undefined => {
      const index = text.indexOf(marker, start);
      return index === -1 ? undefined : index + marker.length;
    };
    if (text.startsWith('<!--', start)) return closer('-->');
    if (text.startsWith('<![CDATA[', start)) return closer(']]>');
    if (text.startsWith('<?', start)) return closer('?>');
    if (text.length - start < 9 && '<![CDATA['.startsWith(text.slice(start))) return undefined;
    if (text.length - start < 4 && '<!--'.startsWith(text.slice(start))) return undefined;
    let quote: string | undefined;
    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];
      if (quote !== undefined) {
        if (char === quote) quote = undefined;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        return index + 1;
      }
    }
    return undefined;
  }

  private visit(text: string, start: number, end: number): void {
    const next = text[start + 1];
    if (next === '!' || next === '?') return;
    if (next === '/') {
      this.stack.pop();
      if (this.entryDepth !== undefined && this.stack.length === this.entryDepth) {
        this.entryDepth = undefined;
      }
      return;
    }
    const name = /^[^\s/>]+/.exec(text.slice(start + 1, end))?.[0];
    if (name === undefined) return;
    const selfClosing = text[end - 2] === '/';
    const localName = name.slice(name.indexOf(':') + 1);
    if (this.entryDepth === undefined && (localName === 'item' || localName === 'entry')) {
      this.entries += 1;
      if (this.entries > this.maxEntries) {
        this.cut = {
          offset: start,
          closing: [...this.stack]
            .reverse()
            .map((open) => `</${open}>`)
            .join(''),
        };
        return;
      }
      if (!selfClosing) this.entryDepth = this.stack.length;
    }
    if (!selfClosing) this.stack.push(name);
  }
}

/**
 * A `stopReading` hook for page fetches that may turn out to be a feed: a body
 * whose declared type is a feed (not XHTML) stops once its header, everything
 * before the first entry, has arrived; HTML and other bodies are read in full.
 * The resulting `partial` response is enough to tell that the URL is a feed,
 * and {@link feedHeaderText} turns it into a parseable document.
 *
 * A PDF (declared `application/pdf`, or a body that starts with `%PDF-`) stops
 * at its first chunk: it is never a page or a feed, its text decoding is
 * meaningless, and whoever reads it re-fetches it as bytes, so a large PDF is
 * not downloaded under the text-body cap first.
 */
export function stopAtFeedHeader(): (textSoFar: string, contentType: string | null) => boolean {
  const scanner = new FeedEntryScanner(0);
  return (text, contentType) =>
    isPdfContentType(contentType) ||
    startsWithPdfSignature(text) ||
    (isFeedContentType(contentType) && !isHtmlContentType(contentType) && scanner.scan(text));
}

/**
 * The parseable feed text of a response: the full body, or for a `partial`
 * one stopped by {@link stopAtFeedHeader}, its header closed off before the
 * first entry. `undefined` when a partial body has no complete header.
 */
export function feedHeaderText(response: { text: string; partial?: boolean }): string | undefined {
  if (!response.partial) return response.text;
  const scanner = new FeedEntryScanner(0);
  scanner.scan(response.text);
  return scanner.prefix(response.text);
}
