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
});
