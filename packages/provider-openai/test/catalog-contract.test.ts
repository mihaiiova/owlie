import type { HttpFetcher, HttpTextResponse } from '@owlieio/core';
import { catalogContract } from '@owlieio/testing/contract-tests';
import { OpenAICatalog } from '@owlieio/provider-openai';

function fakeFetcher(): HttpFetcher {
  return {
    async fetch(url): Promise<HttpTextResponse> {
      return {
        url,
        contentType: 'application/json',
        text: JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1' }] }),
      };
    },
  };
}

catalogContract('openai', () => new OpenAICatalog({ fetcher: fakeFetcher() }));
