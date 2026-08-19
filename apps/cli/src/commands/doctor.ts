import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import type { CliIo } from '../io.js';
import { ExitCode } from '../io.js';
import type { CliOptions } from '../cli.js';
import { cacheDir, configDir, readUserConfig } from '../config.js';
import type { UserConfig } from '../config.js';
import { ADAPTER_IDS, PROVIDER_IDS } from '../registry.js';

/** Injectable system probes so tests can run `doctor` without spawning. */
export interface DoctorDeps {
  dirWritable(dir: string): Promise<boolean>;
  env: Record<string, string | undefined>;
  readConfig?: () => UserConfig;
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
};

const DEEPSEEK_API_KEY = 'DEEPSEEK_API_KEY';

export interface DoctorReport {
  node: string;
  platform: string;
  arch: string;
  deepSeekApiKey: 'set' | 'not set';
  modelConfigured: 'set' | 'not set';
  adapters: string[];
  providers: string[];
  configDirectory: { path: string; writable: boolean };
  cacheDirectory: { path: string; writable: boolean };
}

async function collectDoctorReport(deps: DoctorDeps): Promise<DoctorReport> {
  const [configWritable, cacheWritable] = await Promise.all([
    deps.dirWritable(configDir()),
    deps.dirWritable(cacheDir()),
  ]);

  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    deepSeekApiKey: deps.env[DEEPSEEK_API_KEY] || deps.readConfig?.().apiKey ? 'set' : 'not set',
    modelConfigured: deps.env['DEEPSEEK_MODEL'] || deps.readConfig?.().model ? 'set' : 'not set',
    adapters: [...ADAPTER_IDS],
    providers: [...PROVIDER_IDS],
    configDirectory: { path: configDir(), writable: configWritable },
    cacheDirectory: { path: cacheDir(), writable: cacheWritable },
  };
}

function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'owlie doctor',
    `  Node: ${report.node}`,
    `  Platform: ${report.platform} (${report.arch})`,
    `  DEEPSEEK_API_KEY: ${report.deepSeekApiKey}`,
    `  Model: ${report.modelConfigured}`,
    `  Adapters: ${report.adapters.join(', ')}`,
    `  Providers: ${report.providers.join(', ')}`,
  ];
  lines.push(
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
