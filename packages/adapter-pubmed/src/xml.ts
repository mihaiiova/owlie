/**
 * Safe, order-preserving XML parsing for NCBI responses (PubMed XML and PMC
 * JATS), and small helpers to walk the result.
 *
 * Same rules as the RSS/Atom parser (ADR 0009): entities are not processed by
 * the parser (references are decoded as text afterwards), and entity
 * declarations and internal DTD subsets are refused. NCBI documents always
 * start with an external `<!DOCTYPE … PUBLIC "…" "…">` line; that one
 * declaration is removed before parsing, since it loads nothing.
 */
import { decodeXML } from 'entities';
import { XMLParser } from 'fast-xml-parser';
import { ExtractionError } from '@owlieio/core';

/** One parsed element: its name, attributes and children in document order. */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** An element, or a run of text. */
export type XmlNode = XmlElement | string;

const XML_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: false,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
} as const;

/** An external DOCTYPE with a public id and system URL, and no internal subset. */
const EXTERNAL_DOCTYPE = /<!DOCTYPE\s+[\w:.-]+\s+PUBLIC\s+"[^"<>[\]]*"\s+"[^"<>[\]]*"\s*>/i;
const DTD_PATTERN = /<\s*!\s*(?:DOCTYPE|ENTITY)/i;

type RawNode = Record<string, unknown>;

function convert(raw: RawNode[]): XmlNode[] {
  const nodes: XmlNode[] = [];
  for (const entry of raw) {
    if (typeof entry['#text'] === 'string') {
      nodes.push(decodeXML(entry['#text']));
      continue;
    }
    const name = Object.keys(entry).find((key) => key !== ':@');
    if (name === undefined || name.startsWith('?')) continue;
    const attrs = (entry[':@'] ?? {}) as Record<string, string>;
    const children = Array.isArray(entry[name]) ? convert(entry[name] as RawNode[]) : [];
    nodes.push({
      name,
      attrs: Object.fromEntries(
        Object.entries(attrs).map(([key, value]) => [key, decodeXML(String(value))]),
      ),
      children,
    });
  }
  return nodes;
}

/** Parses an NCBI XML document into ordered nodes. `what` names it in errors. */
export function parseNcbiXml(xml: string, what: string): XmlNode[] {
  const body = xml.replace(EXTERNAL_DOCTYPE, '');
  if (DTD_PATTERN.test(body)) {
    throw new ExtractionError(`${what} contains a DTD or entity declaration`);
  }
  let raw: unknown;
  try {
    raw = new XMLParser(XML_OPTIONS).parse(body);
  } catch (error) {
    throw new ExtractionError(`failed to parse ${what}`, { cause: error });
  }
  return Array.isArray(raw) ? convert(raw as RawNode[]) : [];
}

export function isElement(node: XmlNode | undefined): node is XmlElement {
  return typeof node === 'object' && node !== null;
}

/** The element children of `node` (or of a node list) named `name`. */
export function children(node: XmlElement | XmlNode[] | undefined, name: string): XmlElement[] {
  const list = Array.isArray(node) ? node : (node?.children ?? []);
  return list.filter((child): child is XmlElement => isElement(child) && child.name === name);
}

/** The first child element named `name`. */
export function child(
  node: XmlElement | XmlNode[] | undefined,
  name: string,
): XmlElement | undefined {
  return children(node, name)[0];
}

/** Follows a path of child names (`child(child(node, a), b)…`). */
export function path(
  node: XmlElement | XmlNode[] | undefined,
  ...names: string[]
): XmlElement | undefined {
  let current: XmlElement | XmlNode[] | undefined = node;
  for (const name of names) current = child(current, name);
  return Array.isArray(current) ? undefined : current;
}

/** Every descendant element named `name`, in document order. */
export function descendants(node: XmlElement | XmlNode[], name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (list: XmlNode[]) => {
    for (const entry of list) {
      if (!isElement(entry)) continue;
      if (entry.name === name) found.push(entry);
      walk(entry.children);
    }
  };
  walk(Array.isArray(node) ? node : [node]);
  return found;
}

/** All text below a node, whitespace collapsed. */
export function textOf(node: XmlNode | undefined): string {
  if (node === undefined) return '';
  const parts: string[] = [];
  const walk = (entry: XmlNode) => {
    if (typeof entry === 'string') parts.push(entry);
    else entry.children.forEach(walk);
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
