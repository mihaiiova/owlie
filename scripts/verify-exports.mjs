// Verifies that every built package exposes the entry point declared in its
// "exports" map and that the module can be loaded. Run after `pnpm build`.
//
// Bare-specifier resolution (e.g. `import('@owlieio/core')`) is exercised
// separately by the CLI smoke tests, which run from inside a package that
// declares the dependencies. Here we load each entry file directly so the
// check does not depend on the root having workspace packages linked.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const PACKAGES = [
  'packages/core',
  'packages/testing',
  'packages/adapter-youtube',
  'packages/adapter-podcast',
  'packages/adapter-rss',
  'packages/adapter-reddit',
  'packages/provider-openai',
  'packages/provider-whisper',
  'apps/cli',
];

const failures = [];

for (const dir of PACKAGES) {
  const pkg = readJson(join(root, dir, 'package.json'));
  const name = pkg.name;

  if (!pkg.exports || !pkg.exports['.']) {
    failures.push(`${name}: missing "exports" map entry for "."`);
    continue;
  }

  const entry = pkg.exports['.'];
  const importTarget = entry.import;
  const typesTarget = entry.types;

  if (!importTarget) {
    failures.push(`${name}: exports["."] is missing an "import" condition`);
  } else {
    const file = join(root, dir, importTarget.replace(/^\.\//, ''));
    if (!existsSync(file)) {
      failures.push(`${name}: exports import target ${importTarget} does not exist (run build)`);
    } else {
      try {
        await import(pathToFileURL(file).href);
      } catch (err) {
        failures.push(`${name}: failed to load entry point: ${err.message}`);
      }
    }
  }

  if (!typesTarget) {
    failures.push(`${name}: exports["."] is missing a "types" condition`);
  } else {
    const file = join(root, dir, typesTarget.replace(/^\.\//, ''));
    if (!existsSync(file)) {
      failures.push(`${name}: exports types target ${typesTarget} does not exist (run build)`);
    }
  }
}

// The published `owlie` package must be self-contained: bundling must inline
// the private @owlieio/* packages, leaving no runtime import of them behind.
const cliDist = join(root, 'apps/cli/dist');
if (existsSync(cliDist)) {
  for (const file of readdirSync(cliDist)) {
    if (!file.endsWith('.js')) continue;
    const content = readFileSync(join(cliDist, file), 'utf8');
    if (/@owlieio\//.test(content)) {
      failures.push(`owlie: dist/${file} still references a private @owlieio/* package`);
    }
  }
} else {
  failures.push('owlie: apps/cli/dist is missing (run build)');
}

if (failures.length > 0) {
  console.error('Package export validation failures:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log(`Package export validation passed for ${PACKAGES.length} packages.`);
