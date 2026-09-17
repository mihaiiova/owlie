import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import type { CliIo } from '../io.js';
import { ExitCode } from '../io.js';
import type { CliOptions } from '../cli.js';
import { cacheDir, configDir, readUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { resolveCredentialSource } from '../auth.js';
import type { CredentialSource } from '../auth.js';
import { ADAPTER_IDS, PROVIDER_IDS } from '../registry.js';

/** Injectable system probes so tests can run `doctor` without spawning. */
export interface DoctorDeps {
  dirWritable(dir: string): Promise<boolean>;
  env: Record<string, string | undefined>;
  readConfig?: () => UserConfig;
  toolAvailable?: (tool: string, args?: readonly string[]) => Promise<boolean>;
}

export const defaultDoctorDeps: DoctorDeps = {
  async dirWritable(dir) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  env: process.env,
  readConfig: readUserConfig,
  async toolAvailable(tool, args: readonly string[] = ['--version']) {
    return new Promise((resolve) => {
      const child = spawn(tool, [...args], { stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('exit', (code) => resolve(code === 0));
    });
  },
};

/** Non-secret readiness of a single functional provider. */
export interface ProviderReport {
  id: string;
  apiKey: 'set' | 'not set';
  /** Effective credential source (never the secret itself). */
  authSource: CredentialSource;
  model: 'set' | 'not set';
}

export interface TranscriptionReport {
  whisper: 'detected' | 'not detected';
  ffmpeg: 'detected' | 'not detected';
  ffprobe: 'detected' | 'not detected';
  model: 'set' | 'not set';
}

export interface DoctorReport {
  node: string;
  platform: string;
  arch: string;
  adapters: string[];
  providers: ProviderReport[];
  configDirectory: { path: string; writable: boolean };
  cacheDirectory: { path: string; writable: boolean };
  transcription: TranscriptionReport;
}

function providerReports(
  env: Record<string, string | undefined>,
  config: UserConfig,
): ProviderReport[] {
  return PROVIDER_IDS.map((id) => {
    const prefix = id.toUpperCase();
    const profile = config.providers?.[id];
    return {
      id,
      apiKey: env[`${prefix}_API_KEY`] || profile?.apiKey ? 'set' : 'not set',
      model: env[`${prefix}_MODEL`] || profile?.model ? 'set' : 'not set',
      authSource: resolveCredentialSource(
        id,
        {},
        env,
        () => ({}),
        () => config,
      ),
    };
  });
}

async function collectDoctorReport(deps: DoctorDeps): Promise<DoctorReport> {
  const toolAvailable = deps.toolAvailable ?? defaultDoctorDeps.toolAvailable!;
  const [configWritable, cacheWritable, python, ffmpeg, ffprobe, whisper] = await Promise.all([
    deps.dirWritable(configDir()),
    deps.dirWritable(cacheDir()),
    toolAvailable('python3'),
    toolAvailable('ffmpeg', ['-version']),
    toolAvailable('ffprobe', ['-version']),
    toolAvailable('python3', ['-c', 'import faster_whisper']),
  ]);

  const config = deps.readConfig?.() ?? {};

  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    adapters: [...ADAPTER_IDS],
    providers: providerReports(deps.env, config),
    configDirectory: { path: configDir(), writable: configWritable },
    cacheDirectory: { path: cacheDir(), writable: cacheWritable },
    transcription: {
      whisper: python && whisper ? 'detected' : 'not detected',
      ffmpeg: ffmpeg ? 'detected' : 'not detected',
      ffprobe: ffprobe ? 'detected' : 'not detected',
      model: config.transcription?.model ? 'set' : 'not set',
    },
  };
}

function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'owlie doctor',
    `  Node: ${report.node}`,
    `  Platform: ${report.platform} (${report.arch})`,
    `  Adapters: ${report.adapters.join(', ')}`,
    `  Providers: ${report.providers.map((p) => p.id).join(', ')}`,
  ];
  for (const provider of report.providers) {
    const auth = provider.apiKey === 'set' ? `set (${provider.authSource})` : 'not set';
    lines.push(`  ${provider.id}: api key ${auth}, model ${provider.model}`);
  }
  lines.push(
    `  Transcription: whisper ${report.transcription.whisper}, ffmpeg ${report.transcription.ffmpeg}, ffprobe ${report.transcription.ffprobe}, model ${report.transcription.model}`,
    `  Config directory: ${report.configDirectory.path} (${report.configDirectory.writable ? 'writable' : 'not writable'})`,
    `  Cache directory: ${report.cacheDirectory.path} (${report.cacheDirectory.writable ? 'writable' : 'not writable'})`,
  );
  return lines.join('\n') + '\n';
}

export async function runDoctorCommand(
  io: CliIo,
  options: CliOptions,
  deps?: DoctorDeps,
): Promise<number> {
  const report = await collectDoctorReport(deps ?? defaultDoctorDeps);
  if (options.json) {
    io.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    io.stdout.write(formatDoctorReport(report));
  }
  return ExitCode.Success;
}
