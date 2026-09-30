import { describe, expect, it } from 'vitest';
import { declaredArticleSignal } from '@owlieio/core';

describe('declaredArticleSignal', () => {
  it('reads og:type and JSON-LD article declarations', () => {
    expect(declaredArticleSignal('<meta content="article" property="og:type">')).toBe('og-article');
    expect(
      declaredArticleSignal(
        '<script type="application/ld+json">{"@graph":[{"@type":["TechArticle"]}]}</script>',
      ),
    ).toBe('json-ld-article');
    expect(declaredArticleSignal('<meta property="og:type" content="website">')).toBe(
      'og-non-article',
    );
    expect(declaredArticleSignal('<p>nothing declared</p>')).toBe('none');
  });

  it('skips malformed JSON-LD and stays bounded on deep nesting', () => {
    const deep = '{"@graph":'.repeat(20) + '{"@type":"Article"}' + '}'.repeat(20);
    expect(
      declaredArticleSignal(
        `<script type="application/ld+json">{ bad</script><script type="application/ld+json">${deep}</script>`,
      ),
    ).toBe('none');
  });
});
