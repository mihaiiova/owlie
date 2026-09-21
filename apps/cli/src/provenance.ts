import type { ExtractionWarning, NormalizedDocument } from '@owlieio/core';
import { buildProvenance } from '@owlieio/core';
import { redactUrl } from './protocol.js';

/** Structured warning emitted when a URL defers from audio resolution to article text. */
export const ARTICLE_FALLBACK_WARNING: ExtractionWarning = {
  code: 'ARTICLE_FALLBACK',
  message: 'extracting article text',
};

export interface FinalizeDocumentInput {
  /** The winning adapter id (universal dispatch) or the local producer id. */
  adapterId: string;
  /** ISO-8601 UTC timestamp stamped once at the CLI extraction boundary. */
  fetchedAt: string;
  /** The selected audio resolver id (resolver extraction only). */
  resolverId?: string;
  /** Structured warnings accumulated at the CLI boundary (e.g. ARTICLE_FALLBACK). */
  warnings?: readonly ExtractionWarning[];
  /** Overrides the adapter-derived stable source identity. */
  sourceId?: string;
  /** Overrides the adapter-derived canonical URL (redacted before transport). */
  canonicalUrl?: string;
}

/**
 * Stamps the CLI-owned provenance fields onto an adapter-produced document:
 * the winning adapter id, a single CLI-boundary `fetchedAt`, the selected
 * resolver id, and structured warnings. Adapter document facts (source
 * identity, canonical URL, language, text) are preserved, the canonical URL is
 * redacted of userinfo/query/fragment, and the content fingerprint is
 * recomputed from the final text. This is the single place provenance is
 * finalized before transport.
 */
export function finalizeDocument(
  document: NormalizedDocument,
  input: FinalizeDocumentInput,
): NormalizedDocument {
  const provenance = buildProvenance({
    sourceId: input.sourceId ?? document.provenance.sourceId,
    canonicalUrl: redactUrl(input.canonicalUrl ?? document.provenance.canonicalUrl),
    adapterId: input.adapterId,
    text: document.text,
    fetchedAt: input.fetchedAt,
    resolverId: input.resolverId,
    language: document.provenance.language,
    warnings: [...document.provenance.warnings, ...(input.warnings ?? [])],
  });
  return { ...document, provenance };
}
