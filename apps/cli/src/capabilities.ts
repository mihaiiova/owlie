import type { CliIo } from './io.js';
import { ExitCode } from './io.js';
import type { CliOptions } from './cli.js';
import { JSON_PROTOCOL_SCHEMA_VERSION, NORMALIZED_DOCUMENT_SCHEMA_VERSION } from '@owlieio/core';
import { COMMAND_IDS } from './commands/catalog.js';
import { ADAPTER_IDS, PROVIDER_IDS } from './registry.js';
import { PODCAST_RESOLVER_REGISTRY } from './resolvers.js';
import { writeResultEnvelope } from './protocol.js';
import { VERSION } from './version.js';

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
  /** Document formats the article path reads (ADR 0039). */
  documentFormats: string[];
}

/** Document formats the article adapter reads: web pages and PDFs (ADR 0039). */
export const DOCUMENT_FORMATS: readonly string[] = ['html', 'pdf'];

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
    documentFormats: [...DOCUMENT_FORMATS],
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
      `  Document formats: ${report.documentFormats.join(', ')}`,
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
