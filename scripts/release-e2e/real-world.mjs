// The real-world URL catalog (`e2e/real-world/catalog.json`): real pages,
// feeds, podcasts, PDFs and papers collected over time, often from a user's
// report. Each entry's kind decides the command it runs and the contract it
// must meet. Real content changes, so checks are structural; an entry may add
// text it must contain only when that text never changes (an RFC title).
//
// `status: "gate"` entries fail the release; `status: "watch"` entries are
// reported but never fail it. New entries start as watch and are promoted once
// they have passed reliably. Validation and assertions are pure; scenario
// `run` closures spawn the installed bin.

import { URL } from 'node:url';

import { jsonAssert, parseJson } from './assertions.mjs';

export const CATALOG_VERSION = 1;

/** Seconds between arXiv requests, as arXiv asks; the CLI only spaces requests within one run. */
export const ARXIV_PAUSE_MS = 3_000;

/** Seconds between bioRxiv/medRxiv entries, matching the CLI's page spacing. */
export const BIORXIV_PAUSE_MS = 2_000;

/** The flags the app passes on every call (`owlie --hosted … --json` with its bounds). */
export function appInvocation(args) {
  return ['--hosted', ...args, '--json', '--timeout-ms', '90000', '--max-stdout-bytes', '16777216'];
}

const ENTRY_ID = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AUDIO_URL = /\.(?:mp3|m4a|aac|ogg|opus|wav)(?:[?#]|$)/i;
const ENTRY_ID_SOURCES = new Set(['guid', 'atom-id', 'link', 'rdf-about']);
const COMMON_FIELDS = ['id', 'kind', 'url', 'status', 'origin', 'added', 'notes'];

const ok = { ok: true };
const fail = (error) => ({ ok: false, error });

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value);
}

function containsCheck(entry, text) {
  if (entry.contains === undefined) return ok;
  return String(text).includes(entry.contains)
    ? ok
    : fail(`text does not contain ${JSON.stringify(entry.contains)}`);
}

function isAudioEnclosure(enclosure) {
  if (!enclosure || typeof enclosure !== 'object' || !isHttpUrl(enclosure.url)) return false;
  return (
    String(enclosure.type ?? '')
      .toLowerCase()
      .startsWith('audio/') || AUDIO_URL.test(enclosure.url)
  );
}

/** Checks every listed episode carries an audio enclosure and a stable entry id. */
export function checkPodcastItems(items, { transcripts = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return fail('expected at least one episode');
  for (const item of items) {
    const metadata = item?.metadata ?? {};
    if (typeof item?.id !== 'string' || !item.id.startsWith('rss:entry:')) {
      return fail('episode id is not an rss entry id');
    }
    if (!ENTRY_ID_SOURCES.has(metadata.entryIdSource)) return fail('episode has no entryIdSource');
    if (!Array.isArray(metadata.enclosures) || !metadata.enclosures.some(isAudioEnclosure)) {
      return fail(`episode ${item.id} has no audio enclosure`);
    }
    if (!isHttpUrl(metadata.enclosureUrl)) return fail(`episode ${item.id} has no enclosureUrl`);
    if (metadata.transcripts !== undefined) {
      const valid =
        Array.isArray(metadata.transcripts) &&
        metadata.transcripts.every((transcript) => isHttpUrl(transcript?.url));
      if (!valid) return fail(`episode ${item.id} has malformed transcript links`);
    }
  }
  if (transcripts && !items.some((item) => item.metadata?.transcripts?.length > 0)) {
    return fail('expected publisher transcript links on at least one episode');
  }
  return ok;
}

/** The Apple Podcasts show id in a show URL (`…/id290783428`). */
export function applePodcastId(url) {
  return /\/id(\d+)/.exec(String(url))?.[1];
}

/** The new-style arXiv id in an abs/pdf/html URL, without its version. */
export function arxivIdFromUrl(url) {
  return /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i.exec(String(url))?.[1];
}

/** The lowercased preprint DOI in a bioRxiv/medRxiv `/content/` URL, without its version. */
export function biorxivDoiFromUrl(url) {
  return /(?:bio|med)rxiv\.org\/content\/(10\.(?:1101|64898)\/\d{4}\.\d{2}\.\d{2}\.\d{6,8})/i
    .exec(String(url))?.[1]
    ?.toLowerCase();
}

const normalizeSpace = (text) => String(text).replace(/\s+/g, ' ').trim();

/**
 * Kinds: the command an entry runs (`args`), its result contract (`check`,
 * on the unwrapped `--json` result), the optional fields it accepts, and any
 * pause before it runs.
 */
export const KINDS = {
  article: {
    options: ['minTextChars', 'contains'],
    args: (entry) => ['extract', entry.url, '--article'],
    check: (doc, entry) => {
      if (doc?.sourceType !== 'article')
        return fail(`sourceType ${doc?.sourceType}, expected article`);
      if (doc.provenance?.adapterId !== 'article') return fail('wrong provenance adapterId');
      const min = entry.minTextChars ?? 500;
      if (typeof doc.text !== 'string' || doc.text.length < min) {
        return fail(`text has ${doc.text?.length ?? 0} chars, expected at least ${min}`);
      }
      return containsCheck(entry, doc.text);
    },
  },
  page: {
    // The app's page classification: no --article/--feed, one feed entry at most.
    options: ['classifiesAs'],
    required: ['classifiesAs'],
    args: (entry) => ['extract', entry.url, '--limit', '1'],
    check: (result, entry) => {
      const isBatch = Array.isArray(result?.items);
      if (entry.classifiesAs === 'feed') {
        if (!isBatch) return fail('page was extracted as an article, expected its feed');
        if (!isHttpUrl(result.collection?.canonicalUrl))
          return fail('feed batch has no collection URL');
        return ok;
      }
      if (isBatch) return fail('page was read as a feed, expected an article');
      if (result?.sourceType !== 'article' || !String(result.text ?? '').trim()) {
        return fail('page was not extracted as a readable article');
      }
      return ok;
    },
  },
  feed: {
    options: ['minItems'],
    args: (entry) => ['list', entry.url, '--limit', '3'],
    check: (listing, entry) => {
      if (listing?.collection?.sourceType !== 'rss') return fail('collection is not an rss feed');
      const items = listing.items ?? [];
      if (items.length < (entry.minItems ?? 1))
        return fail(`expected at least ${entry.minItems ?? 1} entries`);
      for (const item of items) {
        if (typeof item.id !== 'string' || !isHttpUrl(item.canonicalUrl)) {
          return fail('entry has no id or URL');
        }
      }
      return ok;
    },
  },
  'podcast-feed': {
    options: ['transcripts'],
    args: (entry) => ['list', entry.url, '--limit', '3', '--order', 'newest'],
    check: (listing, entry) => {
      if (listing?.collection?.sourceType !== 'rss') return fail('collection is not an rss feed');
      return checkPodcastItems(listing.items, { transcripts: entry.transcripts });
    },
  },
  'apple-show': {
    options: ['feedUrl', 'identity'],
    args: (entry) => ['list', entry.url, '--limit', '3', '--order', 'newest'],
    check: (listing, entry) => {
      const apple = listing?.collection?.metadata?.apple;
      if (apple?.podcastId !== applePodcastId(entry.url))
        return fail('collection has the wrong apple.podcastId');
      if (entry.feedUrl && listing.collection.canonicalUrl !== entry.feedUrl) {
        return fail(
          `show resolved to ${listing.collection.canonicalUrl}, expected ${entry.feedUrl}`,
        );
      }
      return checkPodcastItems(listing.items);
    },
  },
  'podcast-episode': {
    options: ['resolver'],
    required: ['resolver'],
    args: (entry) => ['resolve', entry.url],
    check: (resolution, entry) => {
      if (resolution?.resolver !== entry.resolver) {
        return fail(`resolver ${resolution?.resolver}, expected ${entry.resolver}`);
      }
      return isHttpUrl(resolution.mediaUrl) ? ok : fail('resolution has no media URL');
    },
  },
  pdf: {
    options: ['minTextChars', 'contains'],
    args: (entry) => ['extract', entry.url],
    check: (doc, entry) => {
      if (doc?.sourceType !== 'article')
        return fail(`sourceType ${doc?.sourceType}, expected article`);
      if (doc.metadata?.format !== 'pdf') return fail('metadata.format is not pdf');
      if (!(doc.metadata.pageCount >= 1) || !(doc.metadata.pagesRead >= 1))
        return fail('no pages read');
      const min = entry.minTextChars ?? 200;
      if (typeof doc.text !== 'string' || doc.text.length < min) {
        return fail(`text has ${doc.text?.length ?? 0} chars, expected at least ${min}`);
      }
      return containsCheck(entry, doc.text);
    },
  },
  'arxiv-paper': {
    options: ['abstractOnly'],
    pauseMs: ARXIV_PAUSE_MS,
    args: (entry) => ['extract', entry.url, ...(entry.abstractOnly ? ['--abstract-only'] : [])],
    check: (doc, entry) => {
      const id = arxivIdFromUrl(entry.url);
      if (doc?.sourceType !== 'arxiv') return fail(`sourceType ${doc?.sourceType}, expected arxiv`);
      if (doc.id !== `arxiv:${id}`) return fail(`id ${doc.id}, expected arxiv:${id}`);
      const sources = entry.abstractOnly ? ['abstract'] : ['html', 'pdf'];
      if (!sources.includes(doc.metadata?.textSource)) {
        return fail(`textSource ${doc.metadata?.textSource}, expected ${sources.join(' or ')}`);
      }
      const abstract = normalizeSpace(doc.metadata?.abstract ?? '');
      if (abstract.length < 40) return fail('paper has no abstract');
      if (!normalizeSpace(doc.text).includes(abstract.slice(0, 40)))
        return fail('text does not include the abstract');
      return ok;
    },
  },
  'arxiv-listing': {
    options: ['minItems'],
    pauseMs: ARXIV_PAUSE_MS,
    args: (entry) => ['list', entry.url, '--limit', '2'],
    check: (listing, entry) => {
      if (listing?.collection?.sourceType !== 'arxiv')
        return fail('collection is not an arXiv listing');
      const items = listing.items ?? [];
      // A category feed is empty on days without announcements.
      if (items.length < (entry.minItems ?? 1))
        return fail(`expected at least ${entry.minItems ?? 1} papers`);
      for (const item of items) {
        if (item.id !== `arxiv:${item.metadata?.arxivId}`)
          return fail('paper id does not match its arxivId');
      }
      return ok;
    },
  },
  'biorxiv-paper': {
    options: ['abstractOnly'],
    pauseMs: BIORXIV_PAUSE_MS,
    args: (entry) => ['extract', entry.url, ...(entry.abstractOnly ? ['--abstract-only'] : [])],
    check: (doc, entry) => {
      const doi = biorxivDoiFromUrl(entry.url);
      if (doc?.sourceType !== 'biorxiv')
        return fail(`sourceType ${doc?.sourceType}, expected biorxiv`);
      if (doc.id !== `biorxiv:${doi}`) return fail(`id ${doc.id}, expected biorxiv:${doi}`);
      const sources = entry.abstractOnly ? ['abstract'] : ['html', 'pdf'];
      if (!sources.includes(doc.metadata?.textSource)) {
        return fail(`textSource ${doc.metadata?.textSource}, expected ${sources.join(' or ')}`);
      }
      const abstract = normalizeSpace(doc.metadata?.abstract ?? '');
      if (abstract.length < 40) return fail('preprint has no abstract');
      if (!normalizeSpace(doc.text).includes(abstract.slice(0, 40)))
        return fail('text does not include the abstract');
      return ok;
    },
  },
  'biorxiv-listing': {
    options: ['minItems'],
    pauseMs: BIORXIV_PAUSE_MS,
    args: (entry) => ['list', entry.url, '--limit', '2'],
    check: (listing, entry) => {
      if (listing?.collection?.sourceType !== 'biorxiv')
        return fail('collection is not a bioRxiv/medRxiv listing');
      const items = listing.items ?? [];
      if (items.length < (entry.minItems ?? 1))
        return fail(`expected at least ${entry.minItems ?? 1} preprints`);
      for (const item of items) {
        if (item.id !== `biorxiv:${item.metadata?.doi}`)
          return fail('preprint id does not match its doi');
      }
      return ok;
    },
  },
};

/** Validates the catalog file and returns its entries, or every problem found. */
export function validateCatalog(json) {
  let catalog;
  try {
    catalog = JSON.parse(String(json));
  } catch (error) {
    return { ok: false, errors: [`catalog is not valid JSON: ${error.message}`], entries: [] };
  }
  const errors = [];
  if (catalog?.version !== CATALOG_VERSION)
    errors.push(`catalog version must be ${CATALOG_VERSION}`);
  if (!Array.isArray(catalog?.entries) || catalog.entries.length === 0) {
    errors.push('catalog has no entries');
    return { ok: false, errors, entries: [] };
  }
  const seen = new Set();
  for (const [index, entry] of catalog.entries.entries()) {
    const label = `entry ${entry?.id ?? index}`;
    if (!ENTRY_ID.test(String(entry?.id))) errors.push(`${label}: id must be a lowercase slug`);
    else if (seen.has(entry.id)) errors.push(`${label}: duplicate id`);
    seen.add(entry?.id);
    const kind = KINDS[entry?.kind];
    if (!kind) {
      errors.push(`${label}: unknown kind ${JSON.stringify(entry?.kind)}`);
      continue;
    }
    if (!isHttpUrl(entry.url)) errors.push(`${label}: url must be an http(s) URL`);
    if (entry.status !== 'gate' && entry.status !== 'watch')
      errors.push(`${label}: status must be gate or watch`);
    if (typeof entry.origin !== 'string' || entry.origin.trim() === '')
      errors.push(`${label}: origin is required`);
    if (!DATE.test(String(entry.added))) errors.push(`${label}: added must be a YYYY-MM-DD date`);
    for (const field of Object.keys(entry)) {
      if (!COMMON_FIELDS.includes(field) && !kind.options.includes(field)) {
        errors.push(`${label}: ${field} does not apply to kind ${entry.kind}`);
      }
    }
    for (const field of kind.required ?? []) {
      if (entry[field] === undefined) errors.push(`${label}: ${entry.kind} requires ${field}`);
    }
    if (entry.kind === 'arxiv-paper' && !arxivIdFromUrl(entry.url))
      errors.push(`${label}: not an arXiv paper URL`);
    if (entry.kind === 'biorxiv-paper' && !biorxivDoiFromUrl(entry.url))
      errors.push(`${label}: not a bioRxiv/medRxiv preprint URL`);
    if (entry.kind === 'apple-show') {
      if (!applePodcastId(entry.url)) errors.push(`${label}: not an Apple Podcasts show URL`);
      if (entry.identity && !isHttpUrl(entry.feedUrl))
        errors.push(`${label}: identity requires feedUrl`);
    }
  }
  return { ok: errors.length === 0, errors, entries: errors.length === 0 ? catalog.entries : [] };
}

/**
 * Picks a listed episode Apple also lists, from an iTunes lookup response
 * (`entity=podcastEpisode`), and returns its GUID and Apple episode URL.
 */
export function pickAppleEpisode(lookup, items) {
  const guids = new Set(items.map((item) => item.metadata?.entryId).filter(Boolean));
  const episode = (lookup?.results ?? []).find(
    (result) =>
      result?.wrapperType === 'podcastEpisode' &&
      guids.has(result.episodeGuid) &&
      isHttpUrl(result.trackViewUrl),
  );
  if (!episode) return undefined;
  const url = new URL(episode.trackViewUrl);
  url.searchParams.delete('uo');
  return { guid: episode.episodeGuid, url: url.toString() };
}

/**
 * The CLI side of the app's podcast identity gate: the feed and its Apple
 * show list the same entries, and an Apple episode resolves to the audio of
 * the feed entry with its GUID.
 */
export function checkPodcastIdentity({ feed, apple, episode, resolution }) {
  const feedIds = (feed?.items ?? []).map((item) => item.id);
  const appleIds = (apple?.items ?? []).map((item) => item.id);
  if (feedIds.length === 0) return fail('the feed listed no episodes');
  if (JSON.stringify(feedIds) !== JSON.stringify(appleIds)) {
    return fail('the feed and the Apple show list different episode ids');
  }
  const entry = feed.items.find((item) => item.metadata?.entryId === episode?.guid);
  if (!entry) return fail(`no feed entry has the Apple episode's GUID ${episode?.guid}`);
  if (resolution?.resolver !== 'podcast-apple')
    return fail(`resolver ${resolution?.resolver}, expected podcast-apple`);
  const enclosures = [
    entry.metadata.enclosureUrl,
    ...(entry.metadata.enclosures ?? []).map((e) => e?.url),
  ];
  if (!enclosures.includes(resolution.mediaUrl)) {
    return fail('the Apple episode resolved to audio that is not the feed entry enclosure');
  }
  return ok;
}

function unwrap(result) {
  const parsed = parseJson(result.stdout);
  return parsed.ok ? parsed.value?.result : undefined;
}

function stepFailure(message) {
  return { status: 1, stdout: '', stderr: message, signal: null, error: null };
}

function identityScenario(entry, { spawn, fetchJson }) {
  const list = (url) =>
    spawn({
      args: appInvocation(['list', url, '--limit', '5', '--order', 'newest']),
      timeoutMs: 120_000,
    });
  return {
    name: `real-world ${entry.id} identity`,
    gate: entry.status === 'gate',
    allowProxyFallback: false,
    run: async () => {
      const feedRun = list(entry.feedUrl);
      if (feedRun.status !== 0) return feedRun;
      const appleRun = list(entry.url);
      if (appleRun.status !== 0) return appleRun;
      const feed = unwrap(feedRun);
      const apple = unwrap(appleRun);
      let lookup;
      try {
        lookup = await fetchJson(
          `https://itunes.apple.com/lookup?id=${applePodcastId(entry.url)}&entity=podcastEpisode&limit=20`,
        );
      } catch (error) {
        return stepFailure(
          `Apple lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const episode = pickAppleEpisode(lookup, feed?.items ?? []);
      if (!episode) return stepFailure('none of the newest feed episodes is in the Apple lookup');
      const resolveRun = spawn({
        args: appInvocation(['resolve', episode.url]),
        timeoutMs: 120_000,
      });
      if (resolveRun.status !== 0) return resolveRun;
      const result = { feed, apple, episode, resolution: unwrap(resolveRun) };
      return {
        status: 0,
        stdout: JSON.stringify({ schemaVersion: 1, command: 'identity', result }),
        stderr: '',
        signal: null,
        error: null,
      };
    },
    assert: jsonAssert(parseJson, checkPodcastIdentity),
  };
}

/**
 * One scenario per catalog entry, plus the podcast identity check for Apple
 * shows that ask for it. `spawn` is the synchronous bin runner, `fetchJson`
 * fetches a JSON document, and `sleep` waits (both injectable for tests).
 */
export function buildCatalogScenarios(entries, { spawn, fetchJson, sleep }) {
  const scenarios = [];
  for (const entry of entries) {
    const kind = KINDS[entry.kind];
    scenarios.push({
      name: `real-world ${entry.id}`,
      gate: entry.status === 'gate',
      allowProxyFallback: false,
      run: async () => {
        if (kind.pauseMs) await sleep(kind.pauseMs);
        return spawn({ args: appInvocation(kind.args(entry)), timeoutMs: 120_000 });
      },
      assert: jsonAssert(parseJson, (result) => kind.check(result, entry)),
    });
    if (entry.kind === 'apple-show' && entry.identity) {
      scenarios.push(identityScenario(entry, { spawn, fetchJson }));
    }
  }
  return scenarios;
}
