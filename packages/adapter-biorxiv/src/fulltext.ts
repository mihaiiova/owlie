/**
 * Prepares a bioRxiv/medRxiv full-text page (`…/content/<doi>vN.full`) for
 * the generic article reader, with plain string operations (no DOM, no
 * scripts). The page is a HighWire render: the paper body sits in top-level
 * `<div class="section">` blocks, next to the abstract, footnotes, back
 * matter and references, inside a page of site chrome.
 */

/** Section classes that are not the paper body (the header carries the abstract). */
const SKIPPED_SECTIONS = /\b(?:abstract|ref-list|fn-group|ack|data-availability)\b/;

/**
 * The page's body sections, wrapped in a minimal article document, or
 * `undefined` when the page has no body (the full text is not available yet,
 * which is common for recent versions). References, footnotes, the abstract
 * and the site chrome are dropped.
 */
export function prepareBiorxivHtml(html: string, title: string): string | undefined {
  const sections: string[] = [];
  const open = /<div\b[^>]*\bclass="(section(?:\s[^"]*)?)"[^>]*>/gi;
  let searchFrom = 0;
  for (;;) {
    open.lastIndex = searchFrom;
    const start = open.exec(html);
    if (!start) break;
    const end = closingDivEnd(html, start.index + start[0].length);
    if (!SKIPPED_SECTIONS.test(start[1]!)) sections.push(html.slice(start.index, end));
    searchFrom = end;
  }
  if (sections.length === 0) return undefined;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><article>${sections.join('\n')}</article></body></html>`;
}

/** The index just past the `</div>` that closes a `<div>` opened before `from`. */
function closingDivEnd(html: string, from: number): number {
  const token = /<(\/?)div\b[^>]*>/gi;
  token.lastIndex = from;
  let depth = 1;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
