import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const src = (...parts) => join(root, ...parts);

export default defineConfig({
  resolve: {
    alias: {
      '@owlieio/testing/contract-tests': src('packages/testing/src/contract-tests.ts'),
      '@owlieio/core': src('packages/core/src/index.ts'),
      '@owlieio/testing': src('packages/testing/src/index.ts'),
      '@owlieio/adapter-youtube': src('packages/adapter-youtube/src/index.ts'),
      '@owlieio/adapter-article': src('packages/adapter-article/src/index.ts'),
      '@owlieio/adapter-podcast': src('packages/adapter-podcast/src/index.ts'),
      '@owlieio/adapter-rss': src('packages/adapter-rss/src/index.ts'),
      '@owlieio/adapter-reddit': src('packages/adapter-reddit/src/index.ts'),
      '@owlieio/provider-openai': src('packages/provider-openai/src/index.ts'),
      '@owlieio/provider-deepseek': src('packages/provider-deepseek/src/index.ts'),
      '@owlieio/provider-whisper': src('packages/provider-whisper/src/index.ts'),
      owlie: src('apps/cli/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.live.test.ts'],
  },
});
