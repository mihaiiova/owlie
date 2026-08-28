// Release E2E environment configuration resolution. Pure.

const REQUIRED = [
  ['OWLIE_E2E_EXPECTED_VERSION', 'expected package version'],
  ['OWLIE_E2E_ARTICLE_URL', 'controlled article URL'],
  ['OWLIE_E2E_RSS_URL', 'controlled feed URL'],
  ['OWLIE_E2E_YOUTUBE_URL', 'known-caption YouTube URL'],
  ['DEEPSEEK_API_KEY', 'DeepSeek API key'],
];

const SOURCE_URLS = ['OWLIE_E2E_ARTICLE_URL', 'OWLIE_E2E_RSS_URL', 'OWLIE_E2E_YOUTUBE_URL'];

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value).trim());
}

/**
 * Validates the release E2E environment and returns a config object, or a
 * list of errors when required values are missing or malformed. The proxy URL
 * is optional. Called before any live work so misconfiguration fails fast.
 */
export function resolveReleaseConfig(env) {
  const errors = [];
  const config = {};

  for (const [name, label] of REQUIRED) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`missing required environment variable: ${name} (${label})`);
      continue;
    }
    config[name] = value.trim();
  }

  for (const name of SOURCE_URLS) {
    const value = config[name];
    if (value !== undefined && !isHttpUrl(value)) {
      errors.push(`${name} must be an http(s) URL`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, config: null };
  }

  const proxyUrl = env.OWLIE_E2E_PROXY_URL;
  return {
    ok: true,
    errors: [],
    config: {
      expectedVersion: config.OWLIE_E2E_EXPECTED_VERSION,
      articleUrl: config.OWLIE_E2E_ARTICLE_URL,
      feedUrl: config.OWLIE_E2E_RSS_URL,
      youtubeUrl: config.OWLIE_E2E_YOUTUBE_URL,
      apiKey: config.DEEPSEEK_API_KEY,
      proxyUrl: proxyUrl && String(proxyUrl).trim() !== '' ? String(proxyUrl).trim() : undefined,
    },
  };
}
