import { createHash } from 'node:crypto';
import type { ContentFingerprint, DocumentProvenance, ExtractionWarning } from './types.js';

/**
 * Computes the SHA-256 hex digest of the exact normalized document `text`
 * UTF-8 bytes. Source identity and mutable metadata are deliberately excluded
 * so the fingerprint reflects content only.
 */
export function fingerprintText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Builds the labeled content fingerprint for a normalized document text. */
export function contentFingerprint(text: string): ContentFingerprint {
  return { algorithm: 'sha256', digest: fingerprintText(text) };
}

export interface BuildProvenanceInput {
  sourceId: string;
  canonicalUrl: string;
  adapterId: string;
  text: string;
  fetchedAt: string;
  resolverId?: string;
  language?: string;
  warnings?: readonly ExtractionWarning[];
}

/**
 * Assembles a first-class {@link DocumentProvenance} from the document facts
 * (source identity, canonical URL, adapter, language) and the pure content
 * fingerprint. The caller owns the CLI-boundary `fetchedAt` timestamp and any
 * structured warnings; this helper never reads environment state or secrets.
 */
export function buildProvenance(input: BuildProvenanceInput): DocumentProvenance {
  const provenance: DocumentProvenance = {
    sourceId: input.sourceId,
    canonicalUrl: input.canonicalUrl,
    adapterId: input.adapterId,
    fetchedAt: input.fetchedAt,
    contentFingerprint: contentFingerprint(input.text),
    warnings: [...(input.warnings ?? [])],
  };
  if (input.resolverId !== undefined) provenance.resolverId = input.resolverId;
  if (input.language !== undefined) provenance.language = input.language;
  return provenance;
}
