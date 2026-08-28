// Validates the controlled release corpus (article + feed + manifest) against
// the markers and structure the release E2E gate depends on. Pure.

function countEntries(xml) {
  const items = (String(xml).match(/<item[\s>]/gi) ?? []).length;
  const entries = (String(xml).match(/<entry[\s>]/gi) ?? []).length;
  return items + entries;
}

/**
 * @param {{ manifestJson: string, articleHtml: string, feedXml: string }} input
 * @returns {{ ok: boolean, errors: string[], manifest: object | null }}
 */
export function validateCorpus({ manifestJson, articleHtml, feedXml }) {
  const errors = [];
  let manifest = null;
  try {
    manifest = JSON.parse(String(manifestJson ?? ''));
  } catch (error) {
    errors.push(
      `corpus manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, errors, manifest: null };
  }

  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    errors.push('corpus manifest version must be a positive integer');
  }

  const article = manifest.article ?? {};
  const marker = article.marker;
  if (typeof marker !== 'string' || marker === '') {
    errors.push('corpus article marker is missing or empty');
  } else if (!String(articleHtml ?? '').includes(marker)) {
    errors.push('article HTML does not contain the expected marker');
  }

  const entryCount = (manifest.feed ?? {}).entryCount;
  if (!Number.isInteger(entryCount) || entryCount < 1) {
    errors.push('corpus feed entryCount must be a positive integer');
  } else {
    const found = countEntries(feedXml);
    if (found !== entryCount) {
      errors.push(`expected ${entryCount} feed entries, found ${found}`);
    }
  }

  const articlePath = article.path;
  if (typeof articlePath !== 'string' || articlePath === '') {
    errors.push('corpus article path is missing or empty');
  } else if (!String(feedXml ?? '').includes(articlePath)) {
    errors.push(`feed does not link the article path "${articlePath}"`);
  }

  return { ok: errors.length === 0, errors, manifest };
}
