#!/usr/bin/env node
// Opt-in artifact-level verification of the packaged direct-media extractor
// runtime. It packs and installs `owlie`, then runs the installed executable
// against the controlled media fixture:
//
//   node scripts/verify-extractor-runtime.mjs            # shims (default)
//   node scripts/verify-extractor-runtime.mjs --real     # real runtime (gated)
//   node scripts/verify-extractor-runtime.mjs --tarball owlie-0.1.0.tgz
//   node scripts/verify-extractor-runtime.mjs --bin apps/cli/dist/bin.js
//
// Default (shims) mode replaces ffprobe/ffmpeg/python3 with generated command
// shims, so it requires no Whisper model download and no local runtime; the
// only network use is fetching the controlled media fixture (like the release
// E2E gate's Pages corpus). Real mode requires Python + faster-whisper +
// ffmpeg + ffprobe and a pre-provisioned model, and runs with HF_HUB_OFFLINE=1
// to prove the model is loaded from local files only.

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildShims } from './extractor-runtime/shims.mjs';
import { audioEntryFromManifest } from './extractor-runtime/fixture.mjs';
import { buildRealScenarios, buildShimScenarios } from './extractor-runtime/scenarios.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cliDir = join(root, 'apps/cli');
const behaviorPath = join(root, 'scripts/extractor-runtime/runtime-behavior.cjs');
const cliPkg = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8'));

function fail(message) {
  process.stderr.write(`verify-extractor-runtime: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { tarball: null, bin: null, real: false, model: 'tiny' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tarball') out.tarball = argv[i + 1];
    else if (arg === '--bin') out.bin = argv[i + 1];
    else if (arg === '--real') out.real = true;
    else if (arg === '--model') out.model = argv[i + 1];
  }
  return out;
}

function spawn(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { status: res.status ?? null, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function installTarball(tarball) {
  const dir = mkdtempSync(join(tmpdir(), 'owlie-runtime-install-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'runtime-test', private: true }));
  const installed = spawn('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: dir });
  if (installed.status !== 0)
    fail(`npm install of tarball failed: ${installed.stderr || installed.stdout}`);
  return { dir, bin: join(dir, 'node_modules', '.bin', 'owlie') };
}

function packAndInstall() {
  const packDir = mkdtempSync(join(tmpdir(), 'owlie-runtime-pack-'));
  const packed = spawn('npm', ['pack', '--pack-destination', packDir, '--silent'], { cwd: cliDir });
  if (packed.status !== 0) fail(`npm pack failed: ${packed.stderr}`);
  // npm names scoped packages `<scope>-<name>-<version>.tgz` (no `@`, `/` → `-`).
  const tarball = join(
    packDir,
    `${cliPkg.name.replace(/^@/, '').replace('/', '-')}-${cliPkg.version}.tgz`,
  );
  if (!existsSync(tarball)) fail(`tarball not created at ${tarball}`);
  const install = installTarball(tarball);
  rmSync(packDir, { recursive: true, force: true });
  return install;
}

function resolveMediaUrl() {
  if (process.env.OWLIE_EXTRACTOR_MEDIA_URL) {
    const url = process.env.OWLIE_EXTRACTOR_MEDIA_URL.trim();
    if (!/^https?:\/\//i.test(url)) fail('OWLIE_EXTRACTOR_MEDIA_URL must be an http(s) URL');
    return url;
  }
  const manifestPath = join(root, 'e2e/corpus/manifest.json');
  if (!existsSync(manifestPath))
    fail('no media URL: set OWLIE_EXTRACTOR_MEDIA_URL or add e2e/corpus/manifest.json');
  const manifestJson = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestJson);
  const audio = audioEntryFromManifest(manifestJson);
  if (!audio.ok) fail(audio.errors.join('; '));
  if (!manifest.baseUrl)
    fail('corpus manifest is missing baseUrl; set OWLIE_EXTRACTOR_MEDIA_URL instead');
  return `${manifest.baseUrl}/${audio.entry.path}`;
}

function writeShimDir(base, name, config) {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  const shims = buildShims({ ...config, behaviorPath, nodePath: process.execPath });
  for (const [shimName, script] of Object.entries(shims)) {
    if (script === null) continue;
    const path = join(dir, shimName);
    writeFileSync(path, script, { mode: 0o755 });
    chmodSync(path, 0o755);
  }
  return dir;
}

function runScenarios({ scenarios, spawnBin, base }) {
  let failed = false;
  for (const scenario of scenarios) {
    const result = scenario.run(spawnBin);
    const assertion = scenario.assert(result);
    if (assertion.ok) {
      console.log(`ok  ${scenario.name}`);
    } else {
      failed = true;
      console.error(`FAIL ${scenario.name}`);
      for (const error of assertion.errors) console.error(`    - ${error}`);
      console.error(
        `    status=${result.status} stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`,
      );
    }
  }
  rmSync(base, { recursive: true, force: true });
  return failed;
}

const args = parseArgs(process.argv.slice(2));
const base = mkdtempSync(join(tmpdir(), 'owlie-runtime-'));
const homeDir = join(base, 'home');
const configHome = join(base, 'xdg');
mkdirSync(homeDir, { recursive: true });
mkdirSync(join(configHome, 'owlie'), { recursive: true });

const mediaUrl = resolveMediaUrl();

// Resolve the installed executable boundary.
let install = null;
let binPath;
if (args.tarball) {
  install = installTarball(resolve(args.tarball));
  binPath = install.bin;
} else if (args.bin) {
  binPath = join(root, args.bin);
} else {
  install = packAndInstall();
  binPath = install.bin;
}

const baseEnv = {
  HOME: homeDir,
  XDG_CONFIG_HOME: configHome,
  XDG_CACHE_HOME: join(base, 'cache'),
};

let scenarios;
if (args.real) {
  // Pre-provision the configured local model and force offline model lookup.
  writeFileSync(
    join(configHome, 'owlie', 'config.json'),
    `${JSON.stringify({ transcription: { provider: 'whisper-local', model: args.model } }, null, 2)}\n`,
    'utf8',
  );
  scenarios = buildRealScenarios({ mediaUrl });
} else {
  const shimBase = join(base, 'shims');
  const shimDirs = {
    healthy: writeShimDir(shimBase, 'healthy', {}),
    'no-ffprobe': writeShimDir(shimBase, 'no-ffprobe', { ffprobe: 'absent' }),
    'missing-model': writeShimDir(shimBase, 'missing-model', { python: 'missing-model' }),
  };
  scenarios = buildShimScenarios({ mediaUrl });
  // Attach the runtime-specific PATH to each shim scenario after building.
  for (const scenario of scenarios) {
    const runtime = scenario.runtime;
    const originalRun = scenario.run;
    scenario.run = (spawnBin) => {
      const shimDir = shimDirs[runtime];
      // The shim dir only, with an absolute Node shebang: never fall through
      // to host binaries, so an absent shim is a genuinely missing prerequisite.
      const path = shimDir;
      return originalRun(({ args: spawnArgs, input }) =>
        spawnBin({ args: spawnArgs, input, env: { PATH: path } }),
      );
    };
  }
}

const spawnBin = ({ args: binArgs, env = {}, input } = {}) => {
  const realEnv = {
    ...process.env,
    ...baseEnv,
    ...(args.real ? { HF_HUB_OFFLINE: '1' } : {}),
    ...env,
  };
  const res = spawnSync(process.execPath, [binPath, ...binArgs], {
    encoding: 'utf8',
    input,
    timeout: 120_000,
    env: realEnv,
  });
  return {
    status: res.status ?? null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    signal: res.signal ?? null,
    error: res.error ? { code: res.error.code ?? null, message: res.error.message } : null,
  };
};

const failed = runScenarios({ scenarios, spawnBin, base });
if (install) rmSync(install.dir, { recursive: true, force: true });

if (failed) {
  console.error('Extractor runtime verification failed.');
  process.exit(1);
}
console.log('Extractor runtime verification passed.');
