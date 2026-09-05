import { processorContract } from '@owlieio/testing/contract-tests';
import { OpenAIProcessor } from '@owlieio/provider-openai';
import type { OpenAIClient } from '@owlieio/provider-openai';

const client: OpenAIClient = {
  async generate() {
    return { text: 'summary', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
  },
};

processorContract(
  'openai',
  () => new OpenAIProcessor({ apiKey: 'sk-test', model: 'gpt-4o-mini' }, { client }),
);
