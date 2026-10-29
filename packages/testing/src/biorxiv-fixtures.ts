/** Sanitized, trimmed copies of real `api.biorxiv.org` and full-text responses (October 2026). */

export type BiorxivRecordFixture = Record<string, string>;

/** One details record, as the API returns it (every value a string; `NA` for none). */
export function record(fields: Partial<BiorxivRecordFixture> = {}): BiorxivRecordFixture {
  return {
    title: 'The insect brain is specified by a conserved transcriptional program',
    authors: 'Cabanas, N.; Veloso, A.; Zinzen, R.; Bucher, G.',
    author_corresponding: 'Gregor Bucher',
    author_corresponding_institution: 'University of Göttingen',
    doi: '10.64898/2026.08.27.747565',
    date: '2026-10-26',
    version: '1',
    type: 'new results',
    license: 'cc_no',
    category: 'neuroscience',
    jatsxml: 'https://www.biorxiv.org/content/early/2026/10/26/2026.08.27.747565.source.xml',
    abstract: 'The brain is the central processing center that integrates information.',
    published: 'NA',
    server: 'bioRxiv',
    ...fields,
  };
}

/** A details response body. */
export function details(
  records: BiorxivRecordFixture[],
  message: Record<string, string | number> = { status: 'ok', category: 'all' },
): string {
  return JSON.stringify({ messages: [message], collection: records });
}

/** The details response for an unknown DOI or an empty interval. */
export const NO_POSTS = '{"messages":[{"status":"no posts found"}], "collection":[]}';

/** Two versions of one preprint (`/details/biorxiv/10.64898/2026.08.27.747565`). */
export const DETAILS_TWO_VERSIONS = details([
  record({
    title: 'Cross-species single cell transcriptomics in fly and beetle',
    date: '2026-08-31',
    version: '1',
  }),
  record({ date: '2026-10-26', version: '2' }),
]);

/** A medRxiv preprint (eight-digit suffix, medRxiv's own `type` value). */
export const DETAILS_MEDRXIV = details([
  record({
    title: 'Low Dose Naltrexone for Post-COVID Fatigue Syndrome: A Randomized Controlled Trial',
    authors: 'Naik, H.; Boulter, T.; Nacul, L.',
    author_corresponding: 'Luis Nacul',
    author_corresponding_institution: 'University of British Columbia',
    doi: '10.64898/2026.10.22.26363582',
    type: 'PUBLISHAHEADOFPRINT',
    license: 'cc_by',
    category: 'infectious diseases',
    abstract: 'Objectives: To assess the efficacy and safety of low-dose naltrexone.',
    server: 'medRxiv',
  }),
]);

/** A published preprint, with a `{beta}`-encoded title (`10.1101` prefix). */
export const DETAILS_PUBLISHED = details([
  record({
    title: 'Dysregulation in mTOR/HIF-1 signaling and TGF-{beta} in SARS-CoV-2 infected cells',
    authors: 'Appelberg, S.; Gupta, S.; Neogi, U.',
    doi: '10.1101/2020.04.30.070383',
    date: '2020-05-01',
    category: 'microbiology',
    abstract: 'How {Delta} infections engage cellular host pathways remains elusive.',
    published: '10.1080/22221751.2020.1799723',
  }),
]);

/** `/pubs/biorxiv/10.1101/2020.04.30.070383`. */
export const PUBS_PUBLISHED = JSON.stringify({
  messages: [{ status: 'ok' }],
  collection: [
    {
      preprint_doi: '10.1101/2020.04.30.070383',
      published_doi: '10.1080/22221751.2020.1799723',
      published_journal: 'Emerging Microbes & Infections',
      preprint_platform: 'bioRxiv',
      published_date: '2020-07-31',
    },
  ],
});

const PARAGRAPH =
  'We immunized rhesus macaques with a prime and oral boost and measured humoral and T-cell responses in the nasal and lung airways over the course of the study. ';

/** A full-text page with a body, trimmed: site chrome, abstract, body sections, back matter and references. */
export const FULL_TEXT_HTML = `<!DOCTYPE html>
<html lang="en"><head><title>Complete Protection of Nasal and Lung Airways | bioRxiv</title>
<meta name="citation_title" content="Complete Protection of Nasal and Lung Airways" /></head>
<body><div id="page"><nav class="site-nav">Home Submit Subject Areas</nav>
<div class="highwire-cite-authors">Elizabeth Gabitzsch, Jeffrey T. Safrit</div>
<div class="section abstract" id="abstract-1"><h2>ABSTRACT</h2><p>We have developed a dual-antigen vaccine.</p></div>
<div class="section" id="sec-1"><h2>INTRODUCTION</h2><p>${PARAGRAPH.repeat(6)}</p>
<div class="subsection" id="sec-2"><h3>Study design</h3><p>${PARAGRAPH.repeat(3)}</p>
<div id="F1" class="fig pos-float type-figure"><div class="fig-caption"><span class="fig-label">Figure 1.</span> Antibody titers.</div></div></div></div>
<div class="section" id="sec-3"><h2>RESULTS</h2><p>${PARAGRAPH.repeat(6)}</p></div>
<div class="section ack" id="ack-1"><h2>ACKNOWLEDGEMENTS</h2><p>We thank the staff.</p></div>
<div class="section fn-group" id="fn-group-1"><h2>Footnotes</h2><p>An author was added.</p></div>
<div class="section ref-list" id="ref-list-1"><h2>REFERENCES</h2><ol class="cit-list"><li>A reference.</li></ol></div>
<footer>Copyright bioRxiv</footer></div></body></html>`;

/** A full-text page of a recent version: the abstract and back matter, no body yet. */
export const ABSTRACT_ONLY_HTML = `<!DOCTYPE html>
<html lang="en"><head><title>The insect brain | bioRxiv</title></head>
<body><div class="section abstract" id="abstract-1"><h2>Abstract</h2><p>The brain is the central processing center.</p></div>
<div class="section fn-group" id="fn-group-1"><h2>Footnotes</h2><p>This manuscript has been updated.</p></div>
</body></html>`;
