import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { catalogContract } from '@owlieio/testing/contract-tests';
import { DeepSeekCatalog } from '@owlieio/provider-deepseek';

function fakeFetcher(): HttpFetcher {
  return {
    async fetch(url): Promise<HttpTextResponse> {
      return {
        url,
        contentType: 'application/json',
        text: JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }),
      };
    },
  };
}

catalogContract('deepseek', () => new DeepSeekCatalog({ fetcher: fakeFetcher() }));
