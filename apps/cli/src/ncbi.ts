import { ConfigurationError } from '@owlieio/core';
import { loadDotEnv } from './config.js';

export const CONTACT_EMAIL_ENV = 'OWLIE_CONTACT_EMAIL';
export const NCBI_API_KEY_ENV = 'OWLIE_NCBI_API_KEY';

/** How PubMed requests identify themselves to NCBI (ADR 0042). */
export interface NcbiSettings {
  /** Sent as `email=` with every E-utilities request, as NCBI asks. */
  contactEmail?: string;
  /** Optional free NCBI API key: ten requests a second instead of three. */
  apiKey?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const API_KEY = /^[A-Za-z0-9]{8,128}$/;

/**
 * Resolves the NCBI contact email and API key. Each value is read in order:
 * its flag → process environment → `--env-file` → `.env.local` → `.env`.
 * Hosted mode reads the flags and the process environment only. Invalid
 * values throw a {@link ConfigurationError} that names the setting, never its
 * value. Neither value is a provider credential, so neither is stored by
 * `owlie auth`.
 */
export function resolveNcbiSettings(
  options: { hosted?: boolean; envFile?: string; contactEmail?: string; ncbiApiKey?: string },
  env: Record<string, string | undefined> = process.env,
  loadFile: (path: string) => Record<string, string> = loadDotEnv,
): NcbiSettings {
  const files = options.hosted
    ? []
    : [...(options.envFile ? [options.envFile] : []), '.env.local', '.env'];
  let loaded: Record<string, string>[] | undefined;
  const lookup = (name: string): string | undefined => {
    const fromEnv = env[name]?.trim();
    if (fromEnv) return fromEnv;
    loaded ??= files.map((file) => loadFile(file));
    return loaded.map((values) => values[name]?.trim()).find((value) => value);
  };

  const contactEmail = options.contactEmail?.trim() || lookup(CONTACT_EMAIL_ENV);
  if (contactEmail !== undefined && !EMAIL.test(contactEmail)) {
    throw new ConfigurationError(
      `--contact-email (or ${CONTACT_EMAIL_ENV}) must be an email address`,
    );
  }
  const apiKey = options.ncbiApiKey?.trim() || lookup(NCBI_API_KEY_ENV);
  if (apiKey !== undefined && !API_KEY.test(apiKey)) {
    throw new ConfigurationError(
      `--ncbi-api-key (or ${NCBI_API_KEY_ENV}) is not a valid NCBI API key`,
    );
  }
  return {
    ...(contactEmail ? { contactEmail } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}
