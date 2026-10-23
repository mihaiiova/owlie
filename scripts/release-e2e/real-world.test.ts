import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ARXIV_PAUSE_MS,
  appInvocation,
  arxivIdFromUrl,
  buildCatalogScenarios,
  checkPodcastIdentity,
  KINDS,
  pickAppleEpisode,
  validateCatalog,
} from './real-world.mjs';
import { executeScenario } from './scenarios.mjs';

const catalogPath = fileURLToPath(new URL('../../e2e/real-world/catalog.json', import.meta.url));

// Trimmed from real `--json` results (2026-10-23).
const FEED_URL = 'https://feeds.npr.org/510289/podcast.xml';
const AUDIO =
  'https://tracking.swap.fm/track/x/npr.simplecastaudio.com/episodes/080b75be/audio/128/default.mp3?size=30878911';
const episode = (guid, overrides = {}) => ({
  id: `rss:entry:${guid}`,
  sourceType: 'rss',
  canonicalUrl: `https://www.npr.org/${guid}`,
  metadata: {
    entryId: guid,
    entryIdSource: 'guid',
    enclosures: [{ url: `${AUDIO}&e=${guid}`, type: 'audio/mpeg', length: 30878911 }],
    enclosureUrl: `${AUDIO}&e=${guid}`,
    ...overrides,
  },
});
const feedListing = (items = [episode('515a052e'), episode('b297c28a')]) => ({
  collection: {
    id: `rss:feed:${FEED_URL}`,
    sourceType: 'rss',
    canonicalUrl: FEED_URL,
    metadata: { format: 'rss' },
  },
  items,
});
const appleListing = (items) => {
  const listing = feedListing(items);
  listing.collection.metadata.apple = {
    podcastId: '290783428',
    showUrl: 'https://podcasts.apple.com/us/podcast/id290783428',
  };
  return listing;
};
const ATTENTION_ABSTRACT =
  'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration.';
const arxivDoc = (overrides = {}) => ({
  id: 'arxiv:1706.03762',
  sourceType: 'arxiv',
  text: `Attention Is All You Need\n\nAbstract\n\nThe dominant sequence transduction models are based on complex\nrecurrent or convolutional neural networks in an encoder-decoder configuration.\n\n1 Introduction`,
  metadata: {
    arxivId: '1706.03762',
    versionedId: '1706.03762v7',
    abstract: ATTENTION_ABSTRACT,
    textSource: 'html',
  },
  ...overrides,
});

const entry = (kind, overrides = {}) => ({
  id: 'sample',
  kind,
  url: 'https://example.com/x',
  status: 'gate',
  origin: 'test',
  added: '2026-10-23',
  ...overrides,
});
const check = (kind, result, overrides) => KINDS[kind].check(result, entry(kind, overrides));
const ok = (outcome) => expect(outcome).toEqual({ ok: true });
const failsWith = (outcome, pattern) => {
  expect(outcome.ok).toBe(false);
  expect(outcome.error).toMatch(pattern);
};

describe('the catalog file', () => {
  it('is valid, with unique ids and at least one entry of every kind', () => {
    const result = validateCatalog(readFileSync(catalogPath, 'utf8'));
    expect(result.errors).toEqual([]);
    const kinds = new Set(result.entries.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(Object.keys(KINDS).sort());
  });

  it('gates the podcast identity check on at least one Apple show', () => {
    const { entries } = validateCatalog(readFileSync(catalogPath, 'utf8'));
    expect(entries.some((e) => e.kind === 'apple-show' && e.identity && e.status === 'gate')).toBe(
      true,
    );
  });
});

describe('validateCatalog', () => {
  const catalog = (entries) => JSON.stringify({ version: 1, entries });

  it('rejects invalid JSON, a wrong version and an empty catalog', () => {
    expect(validateCatalog('{').errors[0]).toMatch(/not valid JSON/);
    expect(
      validateCatalog(JSON.stringify({ version: 2, entries: [entry('article')] })).errors,
    ).toContain('catalog version must be 1');
    expect(validateCatalog(catalog([])).errors).toContain('catalog has no entries');
  });

  it('reports every problem with an entry', () => {
    const { ok: valid, errors } = validateCatalog(
      catalog([
        entry('article'),
        entry('article', {
          url: 'ftp://x',
          status: 'maybe',
          origin: ' ',
          added: 'today',
          resolver: 'x',
        }),
        entry('podcast', { id: 'other' }),
        entry('podcast-episode', { id: 'episode' }),
        entry('apple-show', { id: 'show', identity: true }),
        entry('arxiv-paper', { id: 'paper' }),
      ]),
    );
    expect(valid).toBe(false);
    expect(errors).toEqual([
      'entry sample: duplicate id',
      'entry sample: url must be an http(s) URL',
      'entry sample: status must be gate or watch',
      'entry sample: origin is required',
      'entry sample: added must be a YYYY-MM-DD date',
      'entry sample: resolver does not apply to kind article',
      'entry other: unknown kind "podcast"',
      'entry episode: podcast-episode requires resolver',
      'entry show: not an Apple Podcasts show URL',
      'entry show: identity requires feedUrl',
      'entry paper: not an arXiv paper URL',
    ]);
  });
});

describe('kind contracts', () => {
  it('article: readable text from the article adapter, and fixed text when given', () => {
    const doc = {
      sourceType: 'article',
      text: 'x'.repeat(600),
      provenance: { adapterId: 'article' },
    };
    ok(check('article', doc));
    failsWith(check('article', { ...doc, text: 'short' }), /expected at least 500/);
    ok(check('article', { ...doc, text: 'short' }, { minTextChars: 5 }));
    failsWith(check('article', doc, { contains: 'HTTP' }), /does not contain/);
    failsWith(check('article', { ...doc, sourceType: 'arxiv' }), /expected article/);
  });

  it('page: classifies as the declared outcome', () => {
    const batch = { collection: { canonicalUrl: 'https://jvns.ca/atom.xml' }, items: [] };
    const doc = { sourceType: 'article', text: 'Readable.' };
    ok(check('page', batch, { classifiesAs: 'feed' }));
    failsWith(check('page', doc, { classifiesAs: 'feed' }), /expected its feed/);
    ok(check('page', doc, { classifiesAs: 'article' }));
    failsWith(check('page', batch, { classifiesAs: 'article' }), /expected an article/);
  });

  it('feed: an rss collection with linked entries', () => {
    ok(check('feed', feedListing()));
    failsWith(check('feed', { ...feedListing(), items: [] }), /at least 1/);
    failsWith(check('feed', feedListing([{ id: 'x', canonicalUrl: 'not a url' }])), /no id or URL/);
  });

  it('podcast-feed: every episode has audio and a stable id; transcripts when asked', () => {
    ok(check('podcast-feed', feedListing()));
    failsWith(
      check(
        'podcast-feed',
        feedListing([
          episode('a', { enclosures: [{ url: 'https://x/a.jpg', type: 'image/jpeg' }] }),
        ]),
      ),
      /no audio enclosure/,
    );
    failsWith(
      check('podcast-feed', feedListing([episode('a', { entryIdSource: undefined })])),
      /entryIdSource/,
    );
    failsWith(check('podcast-feed', feedListing(), { transcripts: true }), /transcript links/);
    const captioned = episode('a', {
      transcripts: [
        {
          url: 'https://mp3s.nashownotes.com/PC20-275-Captions.srt',
          type: 'application/srt',
          rel: 'captions',
        },
      ],
    });
    ok(check('podcast-feed', feedListing([captioned]), { transcripts: true }));
    failsWith(
      check('podcast-feed', feedListing([episode('a', { transcripts: [{ type: 'text/vtt' }] })])),
      /malformed transcript/,
    );
  });

  it('apple-show: the show id and, when given, the feed it resolves to', () => {
    const show = { url: 'https://podcasts.apple.com/us/podcast/planet-money/id290783428' };
    ok(check('apple-show', appleListing(), { ...show, feedUrl: FEED_URL }));
    failsWith(
      check('apple-show', appleListing(), { ...show, feedUrl: 'https://feeds.example.com/other' }),
      /expected https:\/\/feeds\.example/,
    );
    failsWith(check('apple-show', feedListing(), show), /apple\.podcastId/);
  });

  it('podcast-episode: the expected resolver and a media URL', () => {
    const resolution = {
      resolver: 'podcast-page',
      mediaUrl: 'https://www.buzzsprout.com/1/episodes/2562823.mp3',
    };
    ok(check('podcast-episode', resolution, { resolver: 'podcast-page' }));
    failsWith(
      check('podcast-episode', resolution, { resolver: 'podcast-apple' }),
      /expected podcast-apple/,
    );
    failsWith(
      check('podcast-episode', { resolver: 'podcast-page' }, { resolver: 'podcast-page' }),
      /no media URL/,
    );
  });

  it('pdf: an article document read from PDF pages', () => {
    const doc = {
      sourceType: 'article',
      text: `HTTP Semantics ${'x'.repeat(300)}`,
      metadata: { format: 'pdf', pageCount: 194, pagesRead: 194 },
    };
    ok(check('pdf', doc, { contains: 'HTTP Semantics' }));
    failsWith(check('pdf', { ...doc, metadata: { ...doc.metadata, format: 'html' } }), /not pdf/);
    failsWith(
      check('pdf', { ...doc, metadata: { format: 'pdf', pageCount: 0, pagesRead: 0 } }),
      /no pages/,
    );
  });

  it('arxiv-paper: the version-less id, the text source, and the abstract in the text', () => {
    const abs = { url: 'https://arxiv.org/abs/1706.03762' };
    ok(check('arxiv-paper', arxivDoc(), abs));
    failsWith(
      check('arxiv-paper', arxivDoc({ id: 'arxiv:1706.03762v7' }), abs),
      /expected arxiv:1706\.03762/,
    );
    failsWith(check('arxiv-paper', arxivDoc({ text: 'Only a title' }), abs), /abstract/);
    failsWith(
      check('arxiv-paper', arxivDoc(), { ...abs, abstractOnly: true }),
      /expected abstract/,
    );
    const abstractOnly = arxivDoc({ metadata: { ...arxivDoc().metadata, textSource: 'abstract' } });
    ok(
      check('arxiv-paper', abstractOnly, {
        url: 'https://arxiv.org/pdf/1706.03762v1',
        abstractOnly: true,
      }),
    );
  });

  it('arxiv-listing: papers whose ids match their arXiv ids; empty allowed when declared', () => {
    const paper = { id: 'arxiv:2610.30154', metadata: { arxivId: '2610.30154' } };
    const listing = (items) => ({
      collection: { id: 'arxiv:list:cs.CL', sourceType: 'arxiv' },
      items,
    });
    ok(check('arxiv-listing', listing([paper])));
    failsWith(check('arxiv-listing', listing([])), /at least 1/);
    ok(check('arxiv-listing', listing([]), { minItems: 0 }));
    failsWith(check('arxiv-listing', listing([{ ...paper, id: 'arxiv:other' }])), /does not match/);
  });
});

describe('arxivIdFromUrl', () => {
  it('reads abs, pdf and html links without the version', () => {
    expect(arxivIdFromUrl('https://arxiv.org/abs/1706.03762')).toBe('1706.03762');
    expect(arxivIdFromUrl('https://arxiv.org/pdf/1706.03762v1')).toBe('1706.03762');
    expect(arxivIdFromUrl('https://arxiv.org/html/2310.06825v2')).toBe('2310.06825');
    expect(arxivIdFromUrl('https://arxiv.org/list/cs.CL/new')).toBeUndefined();
  });
});

describe('podcast identity', () => {
  const lookup = {
    results: [
      { wrapperType: 'track', kind: 'podcast', collectionId: 290783428 },
      {
        wrapperType: 'podcastEpisode',
        episodeGuid: 'not-in-feed',
        trackViewUrl: 'https://podcasts.apple.com/us/podcast/x/id290783428?i=1&uo=4',
      },
      {
        wrapperType: 'podcastEpisode',
        episodeGuid: 'b297c28a',
        trackViewUrl:
          'https://podcasts.apple.com/us/podcast/wanna-slow-down-ai/id290783428?i=1000796381396&uo=4',
      },
    ],
  };

  it('picks the first Apple episode the feed lists, without the tracking parameter', () => {
    expect(pickAppleEpisode(lookup, feedListing().items)).toEqual({
      guid: 'b297c28a',
      url: 'https://podcasts.apple.com/us/podcast/wanna-slow-down-ai/id290783428?i=1000796381396',
    });
    expect(pickAppleEpisode(lookup, [episode('zzz')])).toBeUndefined();
  });

  const identity = (overrides = {}) => ({
    feed: feedListing(),
    apple: appleListing(),
    episode: { guid: 'b297c28a', url: 'https://podcasts.apple.com/x?i=1' },
    resolution: { resolver: 'podcast-apple', mediaUrl: `${AUDIO}&e=b297c28a` },
    ...overrides,
  });

  it('passes when the feed, the Apple show and the resolved episode agree', () => {
    ok(checkPodcastIdentity(identity()));
  });

  it('fails on different episode ids, a missing GUID, or other audio', () => {
    failsWith(
      checkPodcastIdentity(identity({ apple: appleListing([episode('515a052e')]) })),
      /different episode ids/,
    );
    failsWith(checkPodcastIdentity(identity({ episode: { guid: 'gone' } })), /GUID gone/);
    failsWith(
      checkPodcastIdentity(
        identity({ resolution: { resolver: 'podcast-apple', mediaUrl: 'https://x/other.mp3' } }),
      ),
      /not the feed entry enclosure/,
    );
    failsWith(
      checkPodcastIdentity(
        identity({ resolution: { resolver: 'podcast-media', mediaUrl: `${AUDIO}&e=b297c28a` } }),
      ),
      /expected podcast-apple/,
    );
  });
});

describe('buildCatalogScenarios', () => {
  const respond = (result) => ({
    status: 0,
    stdout: JSON.stringify({ schemaVersion: 1, command: 'x', result }),
    stderr: '',
    signal: null,
    error: null,
  });

  it('runs each entry with the app invocation, pausing before arXiv requests', async () => {
    const calls = [];
    const pauses = [];
    const scenarios = buildCatalogScenarios(
      [
        entry('pdf', {
          id: 'rfc',
          url: 'https://www.rfc-editor.org/rfc/rfc9110.pdf',
          status: 'watch',
        }),
        entry('arxiv-paper', { id: 'paper', url: 'https://arxiv.org/abs/1706.03762' }),
      ],
      {
        spawn: (opts) => {
          calls.push(opts.args);
          return respond({});
        },
        fetchJson: async () => ({}),
        sleep: async (ms) => pauses.push(ms),
      },
    );
    expect(scenarios.map((s) => [s.name, s.gate])).toEqual([
      ['real-world rfc', false],
      ['real-world paper', true],
    ]);
    await scenarios[0].run();
    expect(pauses).toEqual([]);
    await scenarios[1].run();
    expect(pauses).toEqual([ARXIV_PAUSE_MS]);
    expect(calls).toEqual([
      appInvocation(['extract', 'https://www.rfc-editor.org/rfc/rfc9110.pdf']),
      appInvocation(['extract', 'https://arxiv.org/abs/1706.03762']),
    ]);
    expect(calls[0].slice(0, 2)).toEqual(['--hosted', 'extract']);
  });

  const show = entry('apple-show', {
    id: 'pm',
    url: 'https://podcasts.apple.com/us/podcast/planet-money/id290783428',
    feedUrl: FEED_URL,
    identity: true,
  });

  it('adds an identity scenario that lists both, looks the episode up and resolves it', async () => {
    const calls = [];
    const looked = [];
    const spawn = ({ args }) => {
      calls.push(args.slice(1, 3));
      if (args[1] === 'resolve')
        return respond({ resolver: 'podcast-apple', mediaUrl: `${AUDIO}&e=b297c28a` });
      return respond(args[2] === FEED_URL ? feedListing() : appleListing());
    };
    const fetchJson = async (url) => {
      looked.push(url);
      return {
        results: [
          {
            wrapperType: 'podcastEpisode',
            episodeGuid: 'b297c28a',
            trackViewUrl:
              'https://podcasts.apple.com/us/podcast/x/id290783428?i=1000796381396&uo=4',
          },
        ],
      };
    };
    const scenarios = buildCatalogScenarios([show], { spawn, fetchJson, sleep: async () => {} });
    expect(scenarios.map((s) => s.name)).toEqual(['real-world pm', 'real-world pm identity']);
    const result = await executeScenario({ scenario: scenarios[1], ctx: {} });
    expect(result.status).toBe('passed');
    expect(calls).toEqual([
      ['list', FEED_URL],
      ['list', show.url],
      ['resolve', 'https://podcasts.apple.com/us/podcast/x/id290783428?i=1000796381396'],
    ]);
    expect(looked).toEqual([
      'https://itunes.apple.com/lookup?id=290783428&entity=podcastEpisode&limit=20',
    ]);
  });

  it('reports a failed Apple lookup as the failing step', async () => {
    const scenarios = buildCatalogScenarios([show], {
      spawn: ({ args }) => respond(args[2] === FEED_URL ? feedListing() : appleListing()),
      fetchJson: async () => {
        throw new Error('HTTP 503 for lookup');
      },
      sleep: async () => {},
    });
    const result = await scenarios[1].run();
    expect(result).toMatchObject({ status: 1, stderr: 'Apple lookup failed: HTTP 503 for lookup' });
  });
});
