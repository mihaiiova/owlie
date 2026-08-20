// Enforces the documented dependency-direction rules and detects undeclared
// cross-package imports. Run with: pnpm check:deps
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Internal packages are private and never published. `owlie` is the single
// publishable package: it bundles the internal packages into one artifact.
const PACKAGES = [
  { name: '@owlieio/core', dir: 'packages/core', publishable: false },
  { name: '@owlieio/testing', dir: 'packages/testing', publishable: false },
  { name: '@owlieio/adapter-youtube', dir: 'packages/adapter-youtube', publishable: false },
  { name: '@owlieio/adapter-podcast', dir: 'packages/adapter-podcast', publishable: false },
  { name: '@owlieio/adapter-rss', dir: 'packages/adapter-rss', publishable: false },
  { name: '@owlieio/adapter-article', dir: 'packages/adapter-article', publishable: false },
  { name: '@owlieio/adapter-reddit', dir: 'packages/adapter-reddit', publishable: false },
  { name: '@owlieio/provider-openai', dir: 'packages/provider-openai', publishable: false },
  { name: '@owlieio/provider-deepseek', dir: 'packages/provider-deepseek', publishable: false },
  { name: '@owlieio/provider-whisper', dir: 'packages/provider-whisper', publishable: false },
  { name: 'owlie', dir: 'apps/cli', publishable: true },
];

const ADAPTERS = [
  '@owlieio/adapter-youtube',
  '@owlieio/adapter-podcast',
  '@owlieio/adapter-rss',
  '@owlieio/adapter-article',
  '@owlieio/adapter-reddit',
];
const PROVIDERS = [
  '@owlieio/provider-openai',
  '@owlieio/provider-deepseek',
  '@owlieio/provider-whisper',
];

const ALLOWED = {
  '@owlieio/core': [],
  '@owlieio/testing': ['@owlieio/core'],
  '@owlieio/adapter-youtube': ['@owlieio/core'],
  '@owlieio/adapter-podcast': ['@owlieio/core'],
  '@owlieio/adapter-rss': ['@owlieio/core'],
  '@owlieio/adapter-article': ['@owlieio/core'],
  // Documented exception: reddit may reuse public RSS/Atom parsing from rss.
  '@owlieio/adapter-reddit': ['@owlieio/core', '@owlieio/adapter-rss'],
  '@owlieio/provider-openai': ['@owlieio/core'],
  '@owlieio/provider-deepseek': ['@owlieio/core'],
  '@owlieio/provider-whisper': ['@owlieio/core'],
  owlie: ['@owlieio/core', ...ADAPTERS, ...PROVIDERS],
};

const scopedDeps = (deps) => Object.keys(deps ?? {}).filter((d) => d.startsWith('@owlieio/'));

function* walkTsFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.endsWith('.ts')) {
      yield full;
    }
  }
}

function importsOf(dir) {
  const imports = new Set();
  for (const file of walkTsFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    const re = /from\s+['"](@owlieio\/[^'"]+)['"]/g;
    for (const m of text.matchAll(re)) {
      const base = m[1].split('/').slice(0, 2).join('/');
      imports.add(base);
    }
  }
  return imports;
}

const failures = [];

for (const { name, dir, publishable } of PACKAGES) {
  const pkg = readJson(join(root, dir, 'package.json'));
  if (pkg.name !== name) {
    failures.push(`${dir}: expected package name ${name}, found ${pkg.name}`);
  }

  // 1. Declared scoped dependencies must be allowed. `@owlieio/testing` is a
  // test-only package and may be a devDependency of any package.
  for (const dep of scopedDeps(pkg.dependencies)) {
    if (!ALLOWED[name].includes(dep)) {
      failures.push(`${name}: depends on ${dep}, which is not allowed`);
    }
  }
  for (const dep of scopedDeps(pkg.devDependencies)) {
    if (dep === '@owlieio/testing') continue;
    if (!ALLOWED[name].includes(dep)) {
      failures.push(`${name}: dev-depends on ${dep}, which is not allowed`);
    }
  }

  // 2. src imports must be declared where they resolve at build time.
  const srcDir = join(root, dir, 'src');
  if (statSync(srcDir, { throwIfNoEntry: false })) {
    for (const imp of importsOf(srcDir)) {
      if (imp === name) continue;
      if (publishable) {
        // owlie bundles its internal deps, so they live in devDependencies.
        if (!(pkg.devDependencies ?? {})[imp]) {
          failures.push(`${name}: src imports ${imp} but it is not in "devDependencies"`);
        }
      } else if (!(pkg.dependencies ?? {})[imp]) {
        failures.push(`${name}: src imports ${imp} but it is not in "dependencies"`);
      }
    }
  }

  // 3. test imports must be declared as dependencies or devDependencies.
  const testDir = join(root, dir, 'test');
  if (statSync(testDir, { throwIfNoEntry: false })) {
    for (const imp of importsOf(testDir)) {
      if (imp === name) continue;
      if (!(pkg.dependencies ?? {})[imp] && !(pkg.devDependencies ?? {})[imp]) {
        failures.push(`${name}: tests import ${imp} but it is not declared`);
      }
    }
  }

  // 4. Privacy: internal packages stay private; owlie is publishable.
  if (publishable) {
    if (pkg.private === true) {
      failures.push(`${name}: must be publishable (remove "private": true)`);
    }
  } else if (pkg.private !== true) {
    failures.push(`${name}: must be private (internal package, never published)`);
  }
}

if (failures.length > 0) {
  console.error('Dependency boundary violations:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log(
  `Dependency boundary check passed (${PACKAGES.filter((p) => p.publishable).length} publishable, ` +
    `${PACKAGES.filter((p) => !p.publishable).length} internal).`,
);
