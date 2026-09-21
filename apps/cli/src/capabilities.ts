import type { CliIo } from './io.js';
import { ExitCode } from './io.js';
import type { CliOptions } from './cli.js';
import { JSON_PROTOCOL_SCHEMA_VERSION, NORMALIZED_DOCUMENT_SCHEMA_VERSION } from '@owlieio/core';
import { ADAPTER_IDS, PROVIDER_IDS } from './registry.js';
import { PODCAST_RESOLVER_REGISTRY } from './resolvers.js';
import { writeResultEnvelope } from './protocol.js';
import { VERSION } from './version.js';

/**
 * The functional commands the published `owlie` CLI accepts. This is the
 * single source of truth for the command catalog reported by `capabilities`;
 * the dispatch branches in `cli.ts` are the behavior for these ids.
 */
export const COMMAND_IDS: readonly string[] = [
  'extract',
  'resolve',
  'list',
  'process',
  'models',
  'auth',
  'setup',
  'doctor',
  'capabilities',
  'help',
];

/** Credential-free startup manifest reported by `owlie capabilities --json`. */
export interface CapabilitiesReport {
  /** Published artifact/package version. */
  version: string;
  /** JSON subprocess protocol schema version (ADR 0030). */
  protocolSchemaVersion: number;
  /** Normalized document schema version. */
  documentSchemaVersion: number;
  /** Supported command ids. */
  commands: string[];
  /** Supported adapter ids. */
  adapters: string[];
  /** Supported provider ids. */
  providers: string[];
  /** Supported podcast resolver ids. */
  resolvers: string[];
}

/**
 * Builds the credential-free startup manifest from the published version, the
 * protocol and document schema constants, and the registered command/adapter/
 * provider/resolver catalogs — never a duplicated hard-coded list.
 */
export function buildCapabilities(): CapabilitiesReport {
  return {
    version: VERSION,
    protocolSchemaVersion: JSON_PROTOCOL_SCHEMA_VERSION,
    documentSchemaVersion: NORMALIZED_DOCUMENT_SCHEMA_VERSION,
    commands: [...COMMAND_IDS],
    adapters: [...ADAPTER_IDS],
    providers: [...PROVIDER_IDS],
    resolvers: PODCAST_RESOLVER_REGISTRY.map((registration) => registration.name),
  };
}

function formatCapabilities(report: CapabilitiesReport): string {
  return (
    [
      `owlie ${report.version}`,
      `  Protocol schema: v${report.protocolSchemaVersion}`,
      `  Document schema: v${report.documentSchemaVersion}`,
      `  Commands: ${report.commands.join(', ')}`,
      `  Adapters: ${report.adapters.join(', ')}`,
      `  Providers: ${report.providers.join(', ')}`,
      `  Resolvers: ${report.resolvers.join(', ')}`,
    ].join('\n') + '\n'
  );
}

export async function runCapabilitiesCommand(io: CliIo, options: CliOptions): Promise<number> {
  const report = buildCapabilities();
  if (options.json) {
    writeResultEnvelope(io, 'capabilities', report);
  } else {
    io.stdout.write(formatCapabilities(report));
  }
  return ExitCode.Success;
}
