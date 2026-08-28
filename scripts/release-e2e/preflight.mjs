#!/usr/bin/env node
// Release validation preflight: rejects non-main refs and version mismatches
// before any build or live work. Thin glue over the tested pure candidate
// module; not part of the default test suite.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainRef, validateCandidate } from './candidate.mjs';

const ref = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF ?? '';
const expectedVersion = process.env.EXPECTED_VERSION ?? '';
const cliPkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../apps/cli/package.json');
const pkg = JSON.parse(readFileSync(cliPkgPath, 'utf8'));

const errors = [];
if (!isMainRef(ref)) {
  errors.push(`release validation must run on main (got "${ref}")`);
}
const check = validateCandidate({ expectedVersion, packageVersion: pkg.version });
if (!check.ok) errors.push(...check.errors);

if (errors.length > 0) {
  console.error(`release preflight failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`release preflight ok: owlie@${pkg.version} on ${ref}`);
