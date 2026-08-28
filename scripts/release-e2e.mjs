#!/usr/bin/env node
// Release E2E gate: validates a packed `owlie` tarball (or a local bin) against
// the controlled corpus, a known YouTube video, and DeepSeek. This is the
// integration glue; the default test suite covers the pure seams it uses.
//
//   node scripts/release-e2e.mjs --tarball owlie-0.1.0.tgz \
//     --expected-version 0.1.0 --commit <sha> --out report.json
//
// Local development (against the built bin):
//   node scripts/release-e2e.mjs --bin apps/cli/dist/bin.js --expected-version 0.1.0
//
// Required environment: OWLIE_E2E_ARTICLE_URL, OWLIE_E2E_RSS_URL,
// OWLIE_E2E_YOUTUBE_URL, DEEPSEEK_API_KEY. Optional: OWLIE_E2E_PROXY_URL.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validateCandidate } from './release-e2e/candidate.mjs';
import { validateCorpus } from './release-e2e/corpus.mjs';
import { resolveReleaseConfig } from './release-e2e/config.mjs';
import { buildScenarios, executeScenario } from './release-e2e/scenarios.mjs';
import { buildCandidateManifest, buildReport, buildSummary } from './release-e2e/report.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPkg = JSON.parse(readFileSync(join(root, 'apps/cli/package.json'), 'utf8'));

function parseArgs(argv) {
  const out = { tarball: null, bin: null, expectedVersion: null, commitSha: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--tarball') out.tarball = next;
    else if (arg === '--bin') out.bin = next;
    else if (arg === '--expected-version') out.expectedVersion = next;
    else if (arg === '--commit') out.commitSha = next;
    else if (arg === '--out') out.out = next;
  }
  return out;
}

function fail(message) {
  process.stderr.write(`release-e2e: ${message}\n`);
  process.exit(1);
}

function tarballVersion(tarball) {
  const match = /-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/.exec(basename(tarball));
  return match ? match[1] : null;
}

function installTarball(tarball) {
  const dir = mkdtempSync(join(tmpdir(), 'owlie-e2e-install-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'e2e', private: true }));
  const res = spawnSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    fail(`npm install of tarball failed: ${res.stderr ?? res.stdout ?? ''}`);
  }
  return { dir, bin: join(dir, 'node_modules', '.bin', 'owlie') };
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function run(args) {
  const { tarball, bin, expectedVersion, commitSha, out } = args;

  // 1. Resolve the candidate and validate the version before any live work.
  const packageVersion = tarball ? tarballVersion(tarball) : cliPkg.version;
  if (!packageVersion) fail(`could not derive a version from tarball "${basename(tarball)}"`);
  const versionCheck = validateCandidate({
    expectedVersion: expectedVersion ?? process.env.OWLIE_E2E_EXPECTED_VERSION ?? '',
    packageVersion,
  });
  if (!versionCheck.ok) fail(versionCheck.errors.join('; '));

  // 2. Validate the controlled corpus and read its markers/defaults.
  const corpusDir = join(root, 'e2e/corpus');
  const corpusManifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8'));
  const corpusCheck = validateCorpus({
    manifestJson: readFileSync(join(corpusDir, 'manifest.json'), 'utf8'),
    articleHtml: readFileSync(join(corpusDir, 'article.html'), 'utf8'),
    feedXml: readFileSync(join(corpusDir, 'feed.xml'), 'utf8'),
  });
  if (!corpusCheck.ok) fail(`controlled corpus is invalid: ${corpusCheck.errors.join('; ')}`);

  // 3. Resolve live configuration, defaulting source URLs from the manifest.
  const mergedEnv = { ...process.env };
  mergedEnv.OWLIE_E2E_ARTICLE_URL ??= `${corpusManifest.baseUrl}/${corpusManifest.article.path}`;
  mergedEnv.OWLIE_E2E_RSS_URL ??= `${corpusManifest.baseUrl}/${corpusManifest.feed.path}`;
  mergedEnv.OWLIE_E2E_YOUTUBE_URL ??= 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const configResult = resolveReleaseConfig(mergedEnv);
  if (!configResult.ok) fail(configResult.errors.join('\n'));
  const config = configResult.config;
  const secrets = [config.apiKey, config.proxyUrl].filter(Boolean);

  // 4. Prepare isolated HOME/XDG and working directories.
  const base = mkdtempSync(join(tmpdir(), 'owlie-e2e-'));
  const homeDir = join(base, 'home');
  const configHome = join(base, 'xdg');
  const proxyConfigHome = join(base, 'xdg-proxy');
  const workDir = join(base, 'work');
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(join(configHome, 'owlie'), { recursive: true });
  mkdirSync(join(proxyConfigHome, 'owlie'), { recursive: true });
  mkdirSync(workDir, { recursive: true });
  const inputFile = join(workDir, 'input.txt');
  writeFileSync(inputFile, 'The sky is blue.\n', 'utf8');
  if (config.proxyUrl) {
    writeFileSync(
      join(proxyConfigHome, 'owlie', 'config.json'),
      JSON.stringify({ proxy: { type: 'generic', url: config.proxyUrl } }),
      'utf8',
    );
  }
  process.env.HOME = homeDir;
  process.env.XDG_CONFIG_HOME = configHome;

  // 5. Install the tarball (or use the provided bin) and define the spawn seam.
  let install;
  let binPath;
  if (tarball) {
    install = installTarball(tarball);
    binPath = install.bin;
  } else if (bin) {
    binPath = join(root, bin);
  } else {
    rmSync(base, { recursive: true, force: true });
    fail('provide --tarball or --bin');
  }

  const spawn = ({ args: spawnArgs, env = {}, input, timeoutMs }) => {
    const res = spawnSync(process.execPath, [binPath, ...spawnArgs], {
      encoding: 'utf8',
      input,
      timeout: timeoutMs,
      env: { ...process.env, ...env },
    });
    return {
      status: res.status ?? null,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      signal: res.signal ?? null,
      error: res.error
        ? { code: res.error.code ?? null, message: res.error.message ?? String(res.error) }
        : null,
    };
  };

  // 6. Run every scenario and build the sanitized report.
  const ctx = {
    articleUrl: config.articleUrl,
    feedUrl: config.feedUrl,
    youtubeUrl: config.youtubeUrl,
    apiKey: config.apiKey,
    proxyUrl: config.proxyUrl,
    configHome,
    proxyConfigHome,
    inputFile,
    corpus: { marker: corpusManifest.article.marker, entryCount: corpusManifest.feed.entryCount },
  };

  const results = [];
  for (const scenario of buildScenarios(ctx, spawn)) {
    results.push(executeScenario({ scenario, ctx, secrets }));
  }

  const candidate = {
    packageName: 'owlie',
    version: packageVersion,
    commitSha: commitSha ?? 'local',
    tarball: tarball ? basename(tarball) : null,
    sha256: tarball ? sha256(tarball) : null,
  };
  const report = buildReport({ candidate, scenarios: results, secrets });
  const summary = buildSummary(report);
  process.stdout.write(`${summary}\n`);

  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (tarball) {
    const manifest = buildCandidateManifest(candidate);
    if (!manifest.ok) fail(manifest.errors.join('; '));
    const manifestPath = out
      ? join(dirname(out), 'candidate-manifest.json')
      : 'candidate-manifest.json';
    writeFileSync(manifestPath, `${JSON.stringify(manifest.manifest, null, 2)}\n`, 'utf8');
  }

  // 7. Clean up and report the exit status.
  rmSync(base, { recursive: true, force: true });
  if (install) rmSync(install.dir, { recursive: true, force: true });
  const failed = results.some((r) => r.status === 'failed');
  process.exitCode = failed ? 1 : 0;
}

run(parseArgs(process.argv.slice(2)));
