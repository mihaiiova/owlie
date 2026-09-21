import { describe, expect, it } from 'vitest';
import { buildProvenance } from '@owlieio/core';
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';

/**
 * Live DeepSeek processing test. Requires:
 *   - OWLIE_LIVE_TESTS=1
 *   - DEEPSEEK_API_KEY set in the environment
 *   - network access to the DeepSeek API (paid)
 *
 * Skipped in the default suite (see `vitest.config.ts` exclusion) and when the
 * env gate or API key is absent.
 */
const liveEnabled = process.env.OWLIE_LIVE_TESTS === '1';

describe.skipIf(!liveEnabled)('deepseek live processing', () => {
  it('processes a small prompt and returns non-secret metadata', async (ctx) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      ctx.skip();
      return;
    }

    const processor = new DeepSeekProcessor({ apiKey });
    const result = await processor.process({
      document: {
        schemaVersion: 2,
        id: 'live:input',
        sourceType: 'rss',
        canonicalUrl: '',
        mediaType: 'text',
        text: 'The sky is blue.',
        metadata: {},
        provenance: buildProvenance({
          sourceId: 'live:input',
          canonicalUrl: '',
          adapterId: 'rss',
          text: 'The sky is blue.',
          fetchedAt: '2026-09-21T00:00:00.000Z',
        }),
      },
      instruction: 'What color is the sky? Answer in one word.',
    });

    expect(result.output.trim().length).toBeGreaterThan(0);
    expect(result.metadata.model).toBe('deepseek-chat');
    expect(JSON.stringify(result)).not.toContain(apiKey);
  }, 120_000);
});
