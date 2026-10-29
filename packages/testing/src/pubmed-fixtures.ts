/** Sanitized, trimmed copies of real NCBI E-utilities and PMC responses (October 2026). */

const PUBMED_DOCTYPE =
  '<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">';
const PMC_DOCTYPE =
  '<!DOCTYPE pmc-articleset PUBLIC "-//NLM//DTD ARTICLE SET 2.0//EN" "https://dtd.nlm.nih.gov/ncbi/pmc/articleset/nlm-articleset-2.0.dtd">';

/** Wraps `<PubmedArticle>` records in an efetch response. */
export function pubmedSet(...articles: string[]): string {
  return `<?xml version="1.0" ?>\n${PUBMED_DOCTYPE}\n<PubmedArticleSet>\n${articles.join('\n')}\n</PubmedArticleSet>`;
}

/** `efetch db=pubmed id=34265844`, trimmed: three authors, two MeSH headings, references dropped. */
export const ALPHAFOLD_ARTICLE = `<PubmedArticle><MedlineCitation Status="MEDLINE" Owner="NLM"><PMID Version="1">34265844</PMID><Article PubModel="Print-Electronic"><Journal><ISSN IssnType="Electronic">1476-4687</ISSN><JournalIssue CitedMedium="Internet"><Volume>596</Volume><Issue>7873</Issue><PubDate><Year>2021</Year><Month>Aug</Month></PubDate></JournalIssue><Title>Nature</Title><ISOAbbreviation>Nature</ISOAbbreviation></Journal><ArticleTitle>Highly accurate protein structure prediction with AlphaFold.</ArticleTitle><Pagination><MedlinePgn>583-589</MedlinePgn></Pagination><ELocationID EIdType="doi" ValidYN="Y">10.1038/s41586-021-03819-2</ELocationID><Abstract><AbstractText>Proteins are essential to life, and understanding their structure can facilitate a mechanistic understanding of their function.</AbstractText><CopyrightInformation>&#xa9; 2021. The Author(s).</CopyrightInformation></Abstract><AuthorList CompleteYN="Y"><Author ValidYN="Y"><LastName>Jumper</LastName><ForeName>John</ForeName><Initials>J</Initials><AffiliationInfo><Affiliation>DeepMind, London, UK.</Affiliation></AffiliationInfo></Author><Author ValidYN="Y"><LastName>&#x17d;&#xed;dek</LastName><ForeName>Augustin</ForeName><Initials>A</Initials><AffiliationInfo><Affiliation>DeepMind, London, UK.</Affiliation></AffiliationInfo></Author><Author ValidYN="Y"><LastName>Hassabis</LastName><ForeName>Demis</ForeName><Initials>D</Initials><AffiliationInfo><Affiliation>DeepMind, London, UK.</Affiliation></AffiliationInfo></Author></AuthorList><Language>eng</Language><PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList><ArticleDate DateType="Electronic"><Year>2021</Year><Month>07</Month><Day>15</Day></ArticleDate></Article><MeshHeadingList><MeshHeading><DescriptorName UI="D017510" MajorTopicYN="Y">Protein Folding</DescriptorName></MeshHeading><MeshHeading><DescriptorName UI="D000077321" MajorTopicYN="N">Deep Learning</DescriptorName><QualifierName UI="Q000592" MajorTopicYN="N">standards</QualifierName></MeshHeading></MeshHeadingList></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">34265844</ArticleId><ArticleId IdType="pmc">PMC8371605</ArticleId><ArticleId IdType="doi">10.1038/s41586-021-03819-2</ArticleId></ArticleIdList><ReferenceList><Reference><Citation>A cited paper.</Citation><ArticleIdList><ArticleId IdType="doi">10.1000/not-this-article</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle>`;

/** `efetch db=pubmed id=9500320`, trimmed: a structured abstract, retracted, no PMC copy. */
export const RETRACTED_ARTICLE = `<PubmedArticle><MedlineCitation Status="MEDLINE" Owner="NLM"><PMID Version="1">9500320</PMID><Article PubModel="Print"><Journal><JournalIssue CitedMedium="Print"><Volume>351</Volume><Issue>9103</Issue><PubDate><Year>1998</Year><Month>Feb</Month><Day>28</Day></PubDate></JournalIssue><Title>Lancet (London, England)</Title><ISOAbbreviation>Lancet</ISOAbbreviation></Journal><ArticleTitle>Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children.</ArticleTitle><Abstract><AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">We investigated a consecutive series of children.</AbstractText><AbstractText Label="METHODS" NlmCategory="METHODS">12 children were referred to a paediatric unit.</AbstractText></Abstract><AuthorList CompleteYN="Y"><Author ValidYN="Y"><LastName>Wakefield</LastName><ForeName>A J</ForeName><Initials>AJ</Initials></Author><Author ValidYN="Y"><CollectiveName>Royal Free Study Group</CollectiveName></Author></AuthorList><Language>eng</Language><PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D016441">Retracted Publication</PublicationType></PublicationTypeList></Article><KeywordList Owner="NOTNLM"><Keyword MajorTopicYN="N">autism</Keyword></KeywordList></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">9500320</ArticleId><ArticleId IdType="doi">10.1016/s0140-6736(97)11096-0</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`;

/** An empty efetch response (an unknown PMID). */
export const EMPTY_SET = pubmedSet();

const PARAGRAPH =
  'The development of computational methods to predict three-dimensional protein structures from the protein sequence has proceeded along two complementary paths. ';

/** Wraps a JATS `<article>` in an efetch db=pmc response. */
export function pmcSet(article: string): string {
  return `<?xml version="1.0"  ?>${PMC_DOCTYPE}<pmc-articleset>${article}</pmc-articleset>`;
}

/** `efetch db=pmc id=PMC8371605`, trimmed: sections, citations, a figure, a formula, a list, supplementary files, references. */
export function pmcArticle(options: { pmid?: string; body?: boolean } = {}): string {
  const pmid = options.pmid === undefined ? '34265844' : options.pmid;
  const body =
    options.body === false
      ? ''
      : `<body><sec id="Sec1"><title>Main</title><p>${PARAGRAPH.repeat(4)}Methods have fallen short of atomic accuracy<sup><xref ref-type="bibr" rid="CR5">5</xref>,<xref ref-type="bibr" rid="CR6">6</xref></sup>, see Fig. <xref ref-type="fig" rid="Fig1">1</xref>.</p><fig id="Fig1"><label>Fig. 1</label><caption><title>AlphaFold produces highly accurate structures.</title><p><bold>a</bold>, The performance of AlphaFold on CASP14 (<italic>n</italic> = 87).</p></caption><graphic xlink:href="41586_2021_3819_Fig1_HTML.jpg"/></fig></sec><sec id="Sec2"><title>The AlphaFold network</title><p>${PARAGRAPH.repeat(3)}The loss is <inline-formula><alternatives><tex-math id="M1">\\documentclass{minimal}\\begin{document}$\\mathcal{L}_{FAPE}$\\end{document}</tex-math><mml:math><mml:mi>L</mml:mi></mml:math></alternatives></inline-formula> over all frames.</p><list list-type="bullet"><list-item><p>Evoformer blocks</p></list-item><list-item><p>A structure module</p></list-item></list></sec><sec id="Sec3"><title>Supplementary information</title><supplementary-material id="MOESM1"><media xlink:href="41586_2021_3819_MOESM1_ESM.pdf"/></supplementary-material></sec></body>`;
  return `<article article-type="research-article"><front><journal-meta><journal-title-group><journal-title>Nature</journal-title></journal-title-group></journal-meta><article-meta><article-id pub-id-type="pmcid">PMC8371605</article-id>${pmid ? `<article-id pub-id-type="pmid">${pmid}</article-id>` : ''}<article-id pub-id-type="doi">10.1038/s41586-021-03819-2</article-id><title-group><article-title>Highly accurate protein structure prediction with AlphaFold</article-title></title-group><contrib-group><contrib contrib-type="author"><name><surname>Jumper</surname><given-names>John</given-names></name></contrib><contrib contrib-type="author"><name><surname>Hassabis</surname><given-names>Demis</given-names></name></contrib></contrib-group><pub-date pub-type="epub"><day>15</day><month>7</month><year>2021</year></pub-date><abstract><p>Proteins are essential to life.</p></abstract></article-meta></front>${body}<back><ref-list><ref id="CR5"><mixed-citation>A cited paper.</mixed-citation></ref></ref-list></back></article>`;
}

/** `esearch` JSON for a search, newest first. */
export function esearch(
  ids: string[],
  count = ids.length,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    header: { type: 'esearch', version: '0.3' },
    esearchresult: {
      count: String(count),
      retmax: String(ids.length),
      retstart: '0',
      idlist: ids,
      translationset: [],
      ...extra,
    },
  });
}

/** `esearch` JSON for an invalid request. */
export const ESEARCH_ERROR = JSON.stringify({
  header: { type: 'esearch', version: '0.3' },
  esearchresult: { ERROR: 'Empty term and query_key - nothing todo' },
});

/** One `esummary` record. */
export function summaryRecord(
  pmid: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uid: pmid,
    pubdate: '2026 Dec',
    sortpubdate: '2026/09/02 00:00',
    title: 'Co-treating opioid and alcohol use disorders in the GLP-1 era.',
    authors: [
      { name: 'Qeadan F', authtype: 'Author', clusterid: '' },
      { name: 'Barbeau WA', authtype: 'Author', clusterid: '' },
    ],
    fulljournalname: 'Drug and alcohol dependence reports',
    pubtype: ['Journal Article', 'Review'],
    articleids: [
      { idtype: 'pubmed', idtypen: 1, value: pmid },
      { idtype: 'pmc', idtypen: 8, value: 'PMC13578398' },
      { idtype: 'doi', idtypen: 3, value: '10.1016/j.dadr.2026.100474' },
    ],
    ...fields,
  };
}

/** `esummary` JSON for records (an id missing from `records` comes back as an error entry). */
export function esummary(ids: string[], records: Record<string, Record<string, unknown>>): string {
  const result: Record<string, unknown> = { uids: ids };
  for (const id of ids)
    result[id] = records[id] ?? { uid: id, error: 'cannot get document summary' };
  return JSON.stringify({ header: { type: 'esummary', version: '0.3' }, result });
}

/** The PMC ID converter's answer for one PMCID. */
export function idconv(pmcid: string, record: Record<string, unknown>): string {
  return JSON.stringify({
    status: 'ok',
    request: { format: 'json', ids: [pmcid], tool: 'owlie' },
    records: [{ pmcid, 'requested-id': pmcid, ...record }],
  });
}
