/** Sanitized, trimmed copies of real arXiv responses (October 2026). */

export const API_ATTENTION = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/api/zUwBFJ</id>
  <title>arXiv Query: search_query=&amp;id_list=1706.03762&amp;start=0&amp;max_results=10</title>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <title>Attention Is All
      You Need</title>
    <updated>2023-08-02T00:41:18Z</updated>
    <link href="https://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
    <link href="https://arxiv.org/pdf/1706.03762v7" rel="related" type="application/pdf" title="pdf"/>
    <summary>The dominant sequence transduction models are based on complex recurrent
or convolutional neural networks. We propose the Transformer &amp; show it works.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <published>2017-06-12T17:57:34Z</published>
    <arxiv:comment>15 pages, 5 figures</arxiv:comment>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <author><name>Niki Parmar</name></author>
  </entry>
</feed>`;

export const API_OLD_STYLE = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v3</id>
    <title>String Junctions and Their Duals in Heterotic String Theory</title>
    <updated>1999-05-10T09:12:03Z</updated>
    <summary>We explicitly give the correspondence between string junctions and their duals.</summary>
    <category term="hep-th" scheme="http://arxiv.org/schemas/atom"/>
    <published>1999-01-04T07:28:23Z</published>
    <arxiv:comment>13 pages + 4 eps figures</arxiv:comment>
    <arxiv:primary_category term="hep-th"/>
    <author><name>Yosuke Imamura</name></author>
    <arxiv:doi>10.1143/PTP.101.1155</arxiv:doi>
    <arxiv:journal_ref>Prog.Theor.Phys.101:1155-1164,1999</arxiv:journal_ref>
  </entry>
</feed>`;

export const API_WITHDRAWN = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00002v2</id>
    <title>A Withdrawn Result</title>
    <summary>This paper has been withdrawn by the author due to an error in Lemma 2.</summary>
    <category term="math.CO" scheme="http://arxiv.org/schemas/atom"/>
    <published>2023-01-01T00:00:00Z</published>
    <arxiv:comment>This paper has been withdrawn</arxiv:comment>
    <arxiv:primary_category term="math.CO"/>
    <author><name>Some Author</name></author>
  </entry>
</feed>`;

export const API_EMPTY = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/api/rnxrW8</id>
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`;

export const API_QUERY = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>1532</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2610.11111v1</id>
    <title>Evaluating Retrieval for RAG</title>
    <updated>2026-10-20T10:00:00Z</updated>
    <summary>We evaluate retrieval.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-10-20T10:00:00Z</published>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>Ada Example</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2610.22222v2</id>
    <title>Retrieval Evaluation, Revisited</title>
    <updated>2026-10-19T10:00:00Z</updated>
    <summary>We revisit retrieval evaluation.</summary>
    <category term="cs.IR" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-10-01T10:00:00Z</published>
    <arxiv:primary_category term="cs.IR"/>
    <author><name>Bo Example</name></author>
    <author><name>Cy Example</name></author>
  </entry>
</feed>`;

function rssItem(fields: {
  id: string;
  version: string;
  type: string;
  title: string;
  categories: string[];
  creators: string;
  rights?: string;
  extra?: string;
}): string {
  return `<item>
      <title>${fields.title}</title>
      <link>https://arxiv.org/abs/${fields.id}</link>
      <description>arXiv:${fields.id}${fields.version} Announce Type: ${fields.type} 
Abstract: The abstract of ${fields.title}.</description>
      <guid isPermaLink="false">oai:arXiv.org:${fields.id}${fields.version}</guid>
      ${fields.categories.map((category) => `<category>${category}</category>`).join('\n      ')}
      <pubDate>Thu, 22 Oct 2026 00:00:00 -0400</pubDate>
      <arxiv:announce_type>${fields.type}</arxiv:announce_type>
      <dc:rights>${fields.rights ?? 'http://creativecommons.org/licenses/by/4.0/'}</dc:rights>
      ${fields.extra ?? ''}
      <dc:creator>${fields.creators}</dc:creator>
    </item>`;
}

export const RSS_CS_CL = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>cs.CL updates on arXiv.org</title>
    <link>http://rss.arxiv.org/rss/cs.CL</link>
    <description>cs.CL updates on the arXiv.org e-print archive.</description>
    ${rssItem({ id: '2610.28673', version: 'v1', type: 'new', title: 'Frozen Speech Encoders', categories: ['cs.CL', 'cs.SD'], creators: 'Amr Abdelkhalik' })}
    ${rssItem({ id: '2610.26542', version: 'v1', type: 'cross', title: 'Breaking Diffusion', categories: ['cs.AI', 'cs.CL'], creators: 'Jaesang Yu, Seoyeon Byun and Juho Kim' })}
    ${rssItem({ id: '2503.00128', version: 'v2', type: 'replace', title: 'AnnoCaseLaw', categories: ['cs.CL'], creators: 'Rilton Franzone' })}
    ${rssItem({ id: '2008.11573', version: 'v2', type: 'replace-cross', title: 'Multi-Label Sentiment', categories: ['cs.LG', 'cs.CL'], creators: 'Selim F. Yilmaz', rights: 'http://arxiv.org/licenses/nonexclusive-distrib/1.0/', extra: '<arxiv:DOI>10.1109/TNNLS.2021.3094304</arxiv:DOI>' })}
    ${rssItem({ id: 'hep-th/9901001', version: 'v4', type: 'new', title: 'Old Style &amp; Fine', categories: ['hep-th'], creators: 'Yosuke Imamura' })}
  </channel>
</rss>`;

const PARAGRAPH =
  'The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder, which we describe in turn. ';

/** A LaTeXML render as arXiv serves it at `/html/<id>`, trimmed. */
export const LATEXML_HTML = `<!DOCTYPE html><html lang="en"><head>
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<title>Attention Is All You Need</title>
<!--Generated by LaTeXML oxide (version 0.7.6) http://dlmf.nist.gov/LaTeXML/.-->
</head><body>
<div class="ltx_page_main">
<div id="infobox" class="infobox">License: arXiv.org perpetual non-exclusive license</div>
<div class="ltx_page_content">
<article class="ltx_document ltx_authors_1line">
<h1 class="ltx_title ltx_title_document">Attention Is All You Need</h1>
<div class="ltx_authors">
<span class="ltx_creator ltx_role_author"><span class="ltx_personname">Ashish Vaswani</span><span class="ltx_note ltx_role_thanks"><sup class="ltx_note_mark">†</sup><span class="ltx_note_outer"><span class="ltx_note_content"><sup class="ltx_note_mark">†</sup><span class="ltx_note_type">thanks: </span>Equal contribution.</span></span></span></span>
</div>
<div class="ltx_abstract"><h6 class="ltx_title ltx_title_abstract">Abstract</h6>
<p class="ltx_p">The dominant sequence transduction models are based on recurrence.</p></div>
<section id="S1" class="ltx_section">
<h2 class="ltx_title ltx_title_section"><span class="ltx_tag ltx_tag_section">1 </span>Introduction</h2>
<div class="ltx_para"><p class="ltx_p">${PARAGRAPH.repeat(3)}Recurrent models compute a sequence of hidden states <math id="S1.p2.m1" class="ltx_Math" alttext="h_{t}" display="inline"><semantics><msub><mi>h</mi><mi>t</mi></msub><annotation encoding="application/x-tex">h_{t}</annotation></semantics></math>, as a function of the previous hidden state <math alttext="h_{t-1}" display="inline"><mi>h</mi></math> and the input for position <math alttext="t" class="ltx_Math" display="inline"><mi>t</mi></math>.</p></div>
<table class="ltx_equation ltx_eqn_table"><tr><td><math alttext="\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(\\frac{QK^{T}}{\\sqrt{d_{k}}})V" class="ltx_Math" display="block"><mrow><mi>A</mi></mrow></math></td></tr></table>
<div class="ltx_para"><p class="ltx_p">We used the Adam optimizer with <math alttext="\\beta_{1}=0.9" display="inline"><mi>β</mi></math> and <math alttext="a&lt;b" display="inline"><mi>a</mi></math>. ${PARAGRAPH.repeat(2)}</p></div>
</section>
</article></div></div></body></html>`;
