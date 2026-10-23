// Validates the controlled release corpus (manifest, article, feed, and the
// per-source pages) against the markers and structure the release E2E gate
// depends on. Pure.

function countEntries(xml) {
  const items = (String(xml).match(/<item[\s>]/gi) ?? []).length;
  const entries = (String(xml).match(/<entry[\s>]/gi) ?? []).length;
  return items + entries;
}

/** Corpus files that must contain their manifest marker. */
const MARKED_FILES = ['customElementArticle', 'recoveredArticle', 'pdf'];

/** Every file path the manifest declares, so the runner can read them all. */
export function corpusPaths(manifest) {
  const paths = [
    manifest.customElementArticle?.path,
    manifest.recoveredArticle?.path,
    manifest.shortArticle?.path,
    manifest.pdf?.path,
  ];
  return paths.filter((path) => typeof path === 'string' && path !== '');
}

function validateSourceFiles(manifest, files, errors) {
  const file = (path) => files[path];
  for (const key of [...MARKED_FILES, 'shortArticle']) {
    if (typeof manifest[key]?.path !== 'string' || manifest[key].path === '') {
      errors.push(`corpus ${key} path is missing or empty`);
    }
  }
  for (const path of corpusPaths(manifest)) {
    if (typeof file(path) !== 'string' || file(path) === '')
      errors.push(`corpus file ${path} is missing or empty`);
  }
  if (errors.length > 0) return;

  for (const key of MARKED_FILES) {
    const { path, marker } = manifest[key];
    if (typeof marker !== 'string' || marker === '')
      errors.push(`corpus ${key} marker is missing or empty`);
    else if (!file(path).includes(marker))
      errors.push(`${path} does not contain the expected marker`);
  }
  if (
    typeof manifest.shortArticle.errorCode !== 'string' ||
    manifest.shortArticle.errorCode === ''
  ) {
    errors.push('corpus shortArticle errorCode is missing or empty');
  }
  if (!file(manifest.pdf.path).startsWith('%PDF-'))
    errors.push(`${manifest.pdf.path} is not a PDF`);
  if (!Number.isInteger(manifest.pdf.pageCount) || manifest.pdf.pageCount < 1) {
    errors.push('corpus pdf pageCount must be a positive integer');
  }
}

/**
 * @param {{ manifestJson: string, articleHtml: string, feedXml: string, files?: Record<string, string> }} input
 *   `files` maps each of {@link corpusPaths} to its content (a PDF read as latin1).
 * @returns {{ ok: boolean, errors: string[], manifest: object | null }}
 */
export function validateCorpus({ manifestJson, articleHtml, feedXml, files = {} }) {
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

  validateSourceFiles(manifest, files, errors);

  return { ok: errors.length === 0, errors, manifest };
}
