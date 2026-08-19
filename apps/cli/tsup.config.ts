import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  platform: 'node',
  // The internal @owlieio/* packages are devDependencies, so tsup bundles them
  // by default. The explicit matcher documents that the published `owlie`
  // package must be self-contained: no runtime imports of private packages.
  noExternal: [/^@owlieio\//],
  // The AI SDK and its provider packages are large and use dynamic `require`
  // internally, so they are kept external (runtime dependencies) rather than
  // bundled. The transcript library is externalized to avoid bundling its
  // optional `undici` peer dependency. Only the private @owlieio/* packages
  // are inlined.
  external: ['ai', '@ai-sdk/deepseek', '@hallelx/youtube-transcript'],
});
