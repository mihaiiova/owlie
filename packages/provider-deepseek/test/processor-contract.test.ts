import { processorContract } from '@owlieio/testing/contract-tests';
import { DeepSeekProcessor } from '@owlieio/provider-deepseek';
import type { DeepSeekClient } from '@owlieio/provider-deepseek';

const client: DeepSeekClient = {
  async generate() {
    return { text: 'summary', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
  },
};

processorContract('deepseek', () => new DeepSeekProcessor({ apiKey: 'sk-test' }, { client }));
