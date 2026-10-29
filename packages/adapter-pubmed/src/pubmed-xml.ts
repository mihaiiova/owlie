/**
 * Parsing of NCBI E-utilities responses: PubMed article XML (`efetch
 * db=pubmed`), search and summary JSON (`esearch`, `esummary`) and the PMC ID
 * converter. Pure: the adapter fetches, these functions validate and map.
 */
import { ExtractionError } from '@owlieio/core';
import {
  child,
  children,
  descendants,
  parseNcbiXml,
  path,
  textOf,
  type XmlElement,
} from './xml.js';

/** One abstract section; `label` is set for structured abstracts (`BACKGROUND`, `METHODS`). */
export interface PubmedAbstractSection {
  label?: string;
  text: string;
}

/** An article's PubMed record. */
export interface PubmedRecord {
  pmid: string;
  title: string;
  authors: string[];
  /** Distinct author affiliations, in order. */
  affiliations: string[];
  abstractSections: PubmedAbstractSection[];
  journal?: string;
  journalAbbreviation?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`: the electronic date when given, else the issue date. */
  publicationDate?: string;
  publicationTypes: string[];
  meshHeadings: string[];
  keywords: string[];
  language?: string;
  doi?: string;
  pmcid?: string;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function optional(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function twoDigits(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (MONTHS[lower.slice(0, 3)]) return MONTHS[lower.slice(0, 3)];
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 31
    ? String(number).padStart(2, '0')
    : undefined;
}

/** A `<Year><Month><Day>` (or `<MedlineDate>`) element as an ISO date prefix. */
function dateOf(element: XmlElement | undefined): string | undefined {
  if (!element) return undefined;
  const year = textOf(child(element, 'Year'));
  if (!/^\d{4}$/.test(year)) {
    return /^\d{4}/.exec(textOf(child(element, 'MedlineDate')))?.[0];
  }
  const month = twoDigits(textOf(child(element, 'Month')));
  const day = month ? twoDigits(textOf(child(element, 'Day'))) : undefined;
  return [year, month, day].filter(Boolean).join('-');
}

function authorName(author: XmlElement): string | undefined {
  const collective = textOf(child(author, 'CollectiveName'));
  if (collective) return collective;
  const last = textOf(child(author, 'LastName'));
  const fore = textOf(child(author, 'ForeName')) || textOf(child(author, 'Initials'));
  return optional([fore, last].filter(Boolean).join(' '));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ''))];
}

/** Parses one `<PubmedArticle>`. */
function parseArticle(article: XmlElement): PubmedRecord | undefined {
  const citation = child(article, 'MedlineCitation');
  const pmid = textOf(child(citation, 'PMID'));
  const body = child(citation, 'Article');
  const title = textOf(child(body, 'ArticleTitle')) || textOf(child(body, 'VernacularTitle'));
  if (!/^\d+$/.test(pmid) || !title) return undefined;

  const authors = children(child(body, 'AuthorList'), 'Author').filter(
    (author) => author.attrs.ValidYN !== 'N',
  );
  const journal = child(body, 'Journal');
  const issue = child(journal, 'JournalIssue');
  const ids = children(path(article, 'PubmedData', 'ArticleIdList'), 'ArticleId');
  const idOf = (type: string) => optional(textOf(ids.find((id) => id.attrs.IdType === type)));
  const doi =
    idOf('doi') ??
    optional(textOf(children(body, 'ELocationID').find((id) => id.attrs.EIdType === 'doi')));

  const fields = {
    journal: optional(textOf(child(journal, 'Title'))),
    journalAbbreviation: optional(textOf(child(journal, 'ISOAbbreviation'))),
    volume: optional(textOf(child(issue, 'Volume'))),
    issue: optional(textOf(child(issue, 'Issue'))),
    pages: optional(textOf(path(body, 'Pagination', 'MedlinePgn'))),
    publicationDate:
      dateOf(children(body, 'ArticleDate').find((date) => date.attrs.DateType === 'Electronic')) ??
      dateOf(child(issue, 'PubDate')),
    language: optional(textOf(child(body, 'Language'))),
    doi: doi?.toLowerCase(),
    pmcid: idOf('pmc')?.toUpperCase(),
  };
  return {
    pmid,
    title,
    authors: authors.map(authorName).filter((name): name is string => name !== undefined),
    affiliations: unique(
      authors.flatMap((author) =>
        children(author, 'AffiliationInfo').map((info) => textOf(child(info, 'Affiliation'))),
      ),
    ),
    abstractSections: children(child(body, 'Abstract'), 'AbstractText')
      .map((section) => ({
        ...(section.attrs.Label ? { label: section.attrs.Label } : {}),
        text: textOf(section),
      }))
      .filter((section) => section.text !== ''),
    publicationTypes: unique(
      children(child(body, 'PublicationTypeList'), 'PublicationType').map((type) => textOf(type)),
    ),
    meshHeadings: unique(
      children(child(citation, 'MeshHeadingList'), 'MeshHeading').map((heading) =>
        textOf(child(heading, 'DescriptorName')),
      ),
    ),
    keywords: unique(descendants(children(citation, 'KeywordList'), 'Keyword').map(textOf)),
    ...(Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as Partial<PubmedRecord>),
  };
}

/** Parses an `efetch db=pubmed retmode=xml` response. */
export function parsePubmedArticles(xml: string): PubmedRecord[] {
  const set = child(parseNcbiXml(xml, 'PubMed XML'), 'PubmedArticleSet');
  if (!set) throw new ExtractionError('PubMed XML has no PubmedArticleSet');
  return children(set, 'PubmedArticle')
    .map(parseArticle)
    .filter((record): record is PubmedRecord => record !== undefined);
}

/** The abstract as text: labeled sections become paragraph headings. */
export function abstractText(sections: PubmedAbstractSection[]): string {
  return sections
    .map((section) => (section.label ? `${section.label}\n\n${section.text}` : section.text))
    .join('\n\n');
}

/** Whether the record is marked as a retracted publication. */
export function isRetracted(record: PubmedRecord): boolean {
  return record.publicationTypes.some((type) => /^retracted publication$/i.test(type));
}

function parseJson(body: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new ExtractionError(`NCBI returned invalid JSON for ${what}`, { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ExtractionError(`NCBI returned an unexpected response for ${what}`);
  }
  return parsed as Record<string, unknown>;
}

/** An `esearch` result: matching PMIDs, newest first, and the total count. */
export interface PubmedSearchResult {
  ids: string[];
  count: number;
  /** NCBI's messages about the query (ignored phrases, unmatched quotes). */
  messages: string[];
}

/** Parses an `esearch retmode=json` response; NCBI's `ERROR` becomes an {@link ExtractionError}. */
export function parsePubmedSearch(body: string): PubmedSearchResult {
  const root = parseJson(body, 'search');
  const result = root.esearchresult as Record<string, unknown> | undefined;
  if (!result) throw new ExtractionError('NCBI search response has no esearchresult');
  if (typeof result.ERROR === 'string') {
    throw new ExtractionError(`PubMed search failed: ${result.ERROR}`);
  }
  const ids = Array.isArray(result.idlist) ? result.idlist.map(String) : [];
  const warnings = result.warninglist as Record<string, unknown> | undefined;
  const messages = Array.isArray(warnings?.outputmessages)
    ? warnings.outputmessages.map(String)
    : [];
  return { ids, count: Number(result.count) || 0, messages };
}

/** One `esummary` record: enough for a listing item. */
export interface PubmedSummary {
  pmid: string;
  title: string;
  authors: string[];
  journal?: string;
  /** `YYYY-MM-DD`, from NCBI's sort date. */
  publicationDate?: string;
  publicationTypes: string[];
  doi?: string;
  pmcid?: string;
}

/** Parses an `esummary retmode=json` response, in the order of `ids`. */
export function parsePubmedSummaries(body: string, ids: string[]): PubmedSummary[] {
  const result = parseJson(body, 'summary').result as Record<string, unknown> | undefined;
  if (!result) return [];
  const summaries: PubmedSummary[] = [];
  for (const pmid of ids) {
    const raw = result[pmid] as Record<string, unknown> | undefined;
    if (!raw || typeof raw.title !== 'string' || raw.error !== undefined) continue;
    const articleIds = Array.isArray(raw.articleids)
      ? (raw.articleids as Record<string, unknown>[])
      : [];
    const idOf = (type: string) => {
      const value = articleIds.find((id) => id.idtype === type)?.value;
      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const date = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(String(raw.sortpubdate ?? ''));
    const authors = Array.isArray(raw.authors)
      ? (raw.authors as Record<string, unknown>[])
          .filter((author) => author.authtype === undefined || author.authtype === 'Author')
          .map((author) => String(author.name ?? '').trim())
          .filter((name) => name !== '')
      : [];
    const journal = typeof raw.fulljournalname === 'string' ? raw.fulljournalname : undefined;
    summaries.push({
      pmid,
      title: raw.title.replace(/\s+/g, ' ').trim(),
      authors,
      ...(journal ? { journal } : {}),
      ...(date ? { publicationDate: `${date[1]}-${date[2]}-${date[3]}` } : {}),
      publicationTypes: Array.isArray(raw.pubtype) ? raw.pubtype.map(String) : [],
      ...(idOf('doi') ? { doi: idOf('doi')!.toLowerCase() } : {}),
      ...(idOf('pmc') ? { pmcid: idOf('pmc')!.toUpperCase() } : {}),
    });
  }
  return summaries;
}

/** Parses an ID converter response for one PMCID: its PMID and DOI, when PMC knows them. */
export function parseIdConversion(
  body: string,
  pmcid: string,
): { pmid?: string; doi?: string } | undefined {
  const records = parseJson(body, 'ID conversion').records;
  if (!Array.isArray(records)) return undefined;
  const record = (records as Record<string, unknown>[]).find(
    (entry) => String(entry.pmcid ?? '').toUpperCase() === pmcid.toUpperCase(),
  );
  if (!record || record.status === 'error') return undefined;
  const pmid = record.pmid === undefined ? undefined : String(record.pmid);
  const doi = typeof record.doi === 'string' ? record.doi.toLowerCase() : undefined;
  return { ...(pmid && /^\d+$/.test(pmid) ? { pmid } : {}), ...(doi ? { doi } : {}) };
}
