import { describe, expect, it } from 'vitest';
import { isLatexmlRender, prepareLatexmlHtml } from '../src/latexml.js';
import { arxivFixtures } from '@owlieio/testing';

const { LATEXML_HTML } = arxivFixtures;

describe('prepareLatexmlHtml', () => {
  const prepared = prepareLatexmlHtml(LATEXML_HTML);

  it('replaces MathML with its LaTeX source, inline and display', () => {
    expect(prepared).toContain('hidden states $h_{t}$,');
    expect(prepared).toContain('$h_{t-1}$');
    expect(prepared).toContain(
      '$$\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(\\frac{QK^{T}}{\\sqrt{d_{k}}})V$$',
    );
    expect(prepared).toContain('$\\beta_{1}=0.9$');
    expect(prepared).not.toContain('<math');
  });

  it('keeps escaped characters in the LaTeX source escaped for the HTML reader', () => {
    expect(prepared).toContain('$a&lt;b$');
  });

  it('drops the front matter the document header already carries, and footnote marks', () => {
    expect(prepared).not.toContain('ltx_title_document');
    expect(prepared).not.toContain('class="ltx_authors"');
    expect(prepared).not.toContain('Ashish Vaswani');
    expect(prepared).not.toContain('class="ltx_abstract"');
    expect(prepared).toContain('<article class="ltx_document ltx_authors_1line">');
    expect(prepared).not.toContain('ltx_note_mark');
    expect(prepared).not.toContain('thanks: ');
    expect(prepared).toContain('Introduction');
  });
});

describe('isLatexmlRender', () => {
  it('recognizes LaTeXML output and nothing else', () => {
    expect(isLatexmlRender(LATEXML_HTML)).toBe(true);
    expect(isLatexmlRender('<html><body><h1>No HTML for this paper</h1></body></html>')).toBe(
      false,
    );
  });
});
