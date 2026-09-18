export { run } from './cli.js';
export type { CliDeps, CliOptions, ParsedArgs } from './cli.js';
export { parseArgs } from './cli.js';
export { ExitCode, exitCodeForError } from './io.js';
export type { CliIo, Stdin } from './io.js';
export { resolveProcessInput } from './input.js';
export type { ProcessInputSource, StdinSource } from './input.js';
export {
  DEFAULT_SPINNER_FRAMES,
  DEFAULT_SPINNER_INTERVAL_MS,
  Spinner,
  spinnerLine,
} from './spinner.js';
export type { SpinnerLike, SpinnerOptions } from './spinner.js';
export { colorize, writeDiagnostic } from './style.js';
export type { Severity } from './style.js';
export {
  USAGE_ERROR_CODE,
  createCommandSpinner,
  createProgressSink,
  redactUrl,
  redactUrls,
  writeCancelledRecord,
  writeCommandError,
  writeErrorRecord,
  writeProgressRecord,
  writeResultEnvelope,
  writeStreamRecord,
  writeTerminalRecord,
  writeUsageError,
} from './protocol.js';
export type { DoctorDeps } from './commands/doctor.js';
export { runAuthCommand } from './commands/auth.js';
export type { AuthDeps } from './commands/auth.js';
export { runModelsCommand } from './commands/models.js';
export type { ModelsDeps } from './commands/models.js';
export { extractWithFallback, selectItemAdapter } from './dispatch.js';
export { parseCollectionLimit } from './limits.js';
export { parseLanguages } from './commands/extract.js';
export type { ExtractDeps } from './commands/extract.js';
export { parseListLimit } from './commands/list.js';
export type { ListDeps } from './commands/list.js';
export type { ProcessDeps } from './commands/process.js';
export { resolveModelSelection } from './commands/process.js';
export type { ModelSelection } from './commands/process.js';
export { runResolveCommand } from './commands/resolve.js';
export type { ResolveDeps } from './commands/resolve.js';
export { defaultToolAvailable } from './commands/setup.js';
export type { SetupDeps } from './commands/setup.js';
export { VERSION } from './version.js';
export {
  cacheDir,
  configDir,
  configFilePath,
  loadDotEnv,
  readUserConfig,
  resolveProvider,
  resolveProviderSettings,
  writeUserConfig,
} from './config.js';
export type { ProviderEnvConfig, ProviderProfile, UserConfig } from './config.js';
export { removeCredential, resolveCredentialSource, setCredential } from './auth.js';
export type { AuthMethod, CredentialSource } from './auth.js';
export {
  MODEL_CACHE_TTL_MS,
  isCacheFresh,
  modelsCachePath,
  readModelCache,
  writeModelCache,
} from './model-cache.js';
export type { CachedModels, ModelCacheData } from './model-cache.js';
export {
  ADAPTER_IDS,
  PROVIDER_IDS,
  assertKnownProvider,
  defaultItemAdapters,
  getProviderCatalog,
  listProviders,
  resolveModelReference,
  resolveProcessor,
} from './registry.js';
export type { ModelReference, ProcessorConfig, ProviderInfo } from './registry.js';
export {
  PODCAST_RESOLVER_REGISTRY,
  createPodcastResolvers,
  resolvePodcastAudio,
  resolverFlagForName,
  resolverNameForFlag,
} from './resolvers.js';
export type {
  PodcastResolverRegistration,
  ResolvedAudio,
  ResolvePodcastAudioOptions,
} from './resolvers.js';
