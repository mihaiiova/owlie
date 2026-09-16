// Generates self-contained `ffprobe`/`ffmpeg`/`python3` command shims that
// forward their arguments into the pure `runtime-behavior.cjs` module. The
// shims are thin adapters so the behavior (and therefore the runtime contract
// the verification exercises) is unit-tested without spawning subprocesses.

const SHIM_TEMPLATE = `#!SHEBANG
const { FN } = require(PATH);
const r = CALL;
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.file) require('node:fs').writeFileSync(r.file.path, r.file.content);
process.exit(r.exitCode);
`;

/** Builds one shim script text. The shebang is an absolute Node path so the
 * shim never depends on PATH to resolve its interpreter. */
export function buildShimScript(functionName, mode, behaviorPath, nodePath) {
  const call =
    functionName === 'python3'
      ? `python3(process.argv.slice(2), ${JSON.stringify(mode)})`
      : `${functionName}()`;
  return SHIM_TEMPLATE.replace('SHEBANG', nodePath)
    .replace('FN', functionName)
    .replace('PATH', JSON.stringify(behaviorPath))
    .replace('CALL', call);
}

/**
 * Builds a runtime shim set. A `'absent'` value omits that shim so the
 * scenario exercises a genuinely missing prerequisite.
 *
 * @param {{ python?: 'healthy'|'missing-model'|'absent', ffprobe?: 'healthy'|'absent', ffmpeg?: 'healthy'|'absent', behaviorPath: string, nodePath: string }} config
 * @returns {{ python3: string|null, ffprobe: string|null, ffmpeg: string|null }}
 */
export function buildShims({
  python = 'healthy',
  ffprobe = 'healthy',
  ffmpeg = 'healthy',
  behaviorPath,
  nodePath,
}) {
  return {
    python3:
      python === 'absent' ? null : buildShimScript('python3', python, behaviorPath, nodePath),
    ffprobe:
      ffprobe === 'absent' ? null : buildShimScript('ffprobe', ffprobe, behaviorPath, nodePath),
    ffmpeg: ffmpeg === 'absent' ? null : buildShimScript('ffmpeg', ffmpeg, behaviorPath, nodePath),
  };
}
