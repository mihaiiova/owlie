export { run } from './cli.js';
export type { CliDeps, CliOptions, ParsedArgs } from './cli.js';
export { parseArgs } from './cli.js';
export { ExitCode, exitCodeForError } from './io.js';
export type { CliIo, Stdin } from './io.js';
export { resolveProcessInput } from './input.js';
export type { ProcessInputSource, StdinSource } from './input.js';
export type { DoctorDeps } from './commands/doctor.js';
export { parseLanguages } from './commands/extract.js';
export type { ExtractDeps } from './commands/extract.js';
export type { ProcessDeps } from './commands/process.js';
export type { SetupDeps } from './commands/setup.js';
export { VERSION } from './version.js';
export {
  cacheDir,
  configDir,
  configFilePath,
  loadDotEnv,
  readUserConfig,
  resolveDeepSeekConfig,
  writeUserConfig,
} from './config.js';
export type { DeepSeekEnvConfig, UserConfig } from './config.js';
export {
  ADAPTER_IDS,
  FUNCTIONAL_PROVIDER_IDS,
  PROVIDER_IDS,
  listProviders,
  resolveProcessor,
} from './registry.js';
export type { ProcessorConfig, ProviderInfo } from './registry.js';
