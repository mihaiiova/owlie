/**
 * JATS (PMC full text) to plain text. Section titles become their own
 * paragraphs, paragraphs stay paragraphs, figure and table captions are kept
 * with their labels, formulas are kept as LaTeX when the article supplies
 * `tex-math`, and references, citation markers, graphics and supplementary
 * files are dropped.
 */
import {
  child,
  children,
  descendants,
  isElement,
  parseNcbiXml,
  path,
  textOf,
  type XmlElement,
  type XmlNode,
} from './xml.js';

/** Elements whose content is never text for a reader. */
const SKIPPED = new Set([
  'graphic',
  'inline-graphic',
  'media',
  'supplementary-material',
  'ref-list',
  'alternatives',
  'object-id',
  'table',
  'fn-group',
]);

/** Block elements: each becomes its own paragraph. */
const BLOCKS = new Set(['p', 'title', 'caption', 'disp-quote', 'def-item', 'statement']);

/** Block children of a paragraph, split out as paragraphs of their own. */
const NESTED_BLOCKS = new Set(['fig', 'table-wrap', 'list', 'disp-formula', 'disp-quote']);

function isCitation(node: XmlNode): boolean {
  return isElement(node)
    ? node.name === 'xref' && (node.attrs['ref-type'] === 'bibr' || node.attrs['ref-type'] === 'fn')
    : /^[\s,;\u2013\u2014-]*$/.test(node);
}

/** LaTeX for a formula element: its `tex-math`, else MathML `alttext`, else its text. */
function formulaText(formula: XmlElement): string {
  const tex = descendants(formula, 'tex-math')[0];
  if (tex) {
    // tex-math often wraps a whole LaTeX document; keep what is between \begin{document} and \end{document}.
    const raw = textOf(tex);
    const inner = /\\begin\{document\}([\s\S]*)\\end\{document\}/.exec(raw)?.[1] ?? raw;
    return inner.replace(/^\s*\$+|\$+\s*$/g, '').trim();
  }
  const math = descendants(formula, 'mml:math')[0] ?? descendants(formula, 'math')[0];
  if (math?.attrs.alttext) return math.attrs.alttext.trim();
  return textOf(formula);
}

/** The inline text of a node: citation markers and skipped elements dropped, formulas as LaTeX. */
function inline(node: XmlNode): string {
  if (typeof node === 'string') return node;
  if (SKIPPED.has(node.name)) return '';
  if (isCitation(node)) return '';
  if (node.name === 'inline-formula') return `$${formulaText(node)}$`;
  if (node.name === 'disp-formula') return ` $$${formulaText(node)}$$ `;
  // A superscript holding only citation markers (`<sup>1,2</sup>`) is a citation too.
  if (node.name === 'sup' && node.children.some(isElement) && node.children.every(isCitation)) {
    return '';
  }
  return node.children.map(inline).join('');
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*[,;\s]*\)/g, '')
    .trim();
}

/** Appends the paragraphs of a block-level subtree to `out`. */
function blocks(node: XmlElement, out: string[]): void {
  if (SKIPPED.has(node.name)) return;
  if (node.name === 'fig' || node.name === 'table-wrap') {
    const label = textOf(child(node, 'label'));
    const caption = child(node, 'caption');
    const parts = caption
      ? caption.children.filter(isElement).map((entry) => clean(inline(entry)))
      : [];
    const text = [label, ...parts].filter((part) => part !== '').join(' ');
    if (text) out.push(text);
    return;
  }
  if (
    node.name === 'sec' ||
    node.name === 'app' ||
    node.name === 'body' ||
    node.name === 'list' ||
    node.name === 'boxed-text'
  ) {
    const start = out.length;
    let titled = false;
    for (const entry of node.children) {
      if (!isElement(entry)) continue;
      if (entry.name === 'label') continue;
      if (entry.name === 'title') {
        const label = node.name === 'sec' ? textOf(child(node, 'label')) : '';
        const title = clean([label, inline(entry)].filter(Boolean).join(' '));
        if (title) {
          out.push(title);
          titled = true;
        }
        continue;
      }
      blocks(entry, out);
    }
    // A section whose content was all dropped (supplementary files only) loses its heading too.
    if (titled && out.length === start + 1) out.pop();
    return;
  }
  if (node.name === 'list-item') {
    const text = clean(node.children.map(inline).join(' '));
    if (text) out.push(`- ${text}`);
    return;
  }
  if (node.name === 'disp-formula') {
    out.push(`$$${formulaText(node)}$$`);
    return;
  }
  if (BLOCKS.has(node.name)) {
    // A paragraph can hold block children (a figure, a list, an equation); those become their own paragraphs.
    const own: XmlNode[] = [];
    const flush = () => {
      const text = clean(own.map(inline).join(''));
      if (text) out.push(text);
      own.length = 0;
    };
    for (const entry of node.children) {
      if (isElement(entry) && NESTED_BLOCKS.has(entry.name)) {
        flush();
        blocks(entry, out);
      } else {
        own.push(entry);
      }
    }
    flush();
    return;
  }
  for (const entry of node.children) if (isElement(entry)) blocks(entry, out);
}

/** Front matter of a PMC article, for articles with no PubMed record. */
export interface JatsFront {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authors: string[];
  abstract?: string;
  journal?: string;
  publicationDate?: string;
}

/** A parsed PMC article: its front matter and its body as text (`undefined` when PMC withholds the body). */
export interface JatsArticle {
  front: JatsFront;
  body?: string;
}

function jatsDate(meta: XmlElement | undefined): string | undefined {
  const dates = children(meta, 'pub-date');
  const date =
    dates.find((entry) =>
      ['epub', 'electronic'].includes(entry.attrs['pub-type'] ?? entry.attrs['date-type'] ?? ''),
    ) ?? dates[0];
  if (!date) return undefined;
  const year = textOf(child(date, 'year'));
  if (!/^\d{4}$/.test(year)) return undefined;
  const pad = (value: string) => (/^\d{1,2}$/.test(value) ? value.padStart(2, '0') : undefined);
  const month = pad(textOf(child(date, 'month')));
  const day = month ? pad(textOf(child(date, 'day'))) : undefined;
  return [year, month, day].filter(Boolean).join('-');
}

/** Converts a `<body>` element to text paragraphs joined by blank lines. */
export function jatsBodyToText(body: XmlElement): string {
  const out: string[] = [];
  blocks(body, out);
  return out.join('\n\n');
}

/** Parses an `efetch db=pmc` response (a JATS `pmc-articleset`). */
export function parsePmcArticle(xml: string): JatsArticle | undefined {
  const nodes = parseNcbiXml(xml, 'PMC XML');
  const article = path(nodes, 'pmc-articleset', 'article') ?? child(nodes, 'article');
  if (!article) return undefined;
  const front = child(article, 'front');
  const meta = child(front, 'article-meta');
  const ids = children(meta, 'article-id');
  const idOf = (type: string) => {
    const value = textOf(ids.find((id) => id.attrs['pub-id-type'] === type));
    return value === '' ? undefined : value;
  };
  const authors = descendants(child(meta, 'contrib-group') ?? [], 'contrib')
    .filter((contrib) => (contrib.attrs['contrib-type'] ?? 'author') === 'author')
    .map((contrib) => {
      const name = child(contrib, 'name');
      if (name)
        return [textOf(child(name, 'given-names')), textOf(child(name, 'surname'))]
          .filter(Boolean)
          .join(' ');
      return textOf(child(contrib, 'collab'));
    })
    .filter((name) => name !== '');
  const abstract = children(meta, 'abstract').find(
    (entry) => entry.attrs['abstract-type'] === undefined,
  );
  const abstractParagraphs: string[] = [];
  if (abstract) blocks({ ...abstract, name: 'sec' }, abstractParagraphs);
  const journal = textOf(path(front, 'journal-meta', 'journal-title-group', 'journal-title'));
  const pmcid =
    idOf('pmcid') ?? (idOf('pmc') ? `PMC${idOf('pmc')!.replace(/^PMC/i, '')}` : undefined);
  const body = child(article, 'body');
  const bodyText = body ? jatsBodyToText(body) : '';
  const fields = {
    pmid: idOf('pmid'),
    pmcid: pmcid?.toUpperCase(),
    doi: idOf('doi')?.toLowerCase(),
    title: textOf(path(meta, 'title-group', 'article-title')) || undefined,
    abstract: abstractParagraphs.join('\n\n') || undefined,
    journal: journal || undefined,
    publicationDate: jatsDate(meta),
  };
  return {
    front: {
      authors,
      ...(Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as Partial<JatsFront>),
    },
    ...(bodyText ? { body: bodyText } : {}),
  };
}
