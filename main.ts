// Token Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot, ranks every watchlist protocol
// plus the strongest early candidates with the radar-2 model in
// lib/model.ts, and writes the four things the gate expects into the
// output directory:
//
//   board.json    the ranked board (rows carry implied value + farm plan)
//   data.js       the same board as a script the static dashboard reads
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  buildDossier() from vendor/makefun-board.ts, written
//                 last because the scorer rebuilds it and compares bytes
//
// Input comes from --input <file|dir> or /input; output goes to
// --output <dir>, $MAKEFUN_OUTPUT_DIR, or /output. The program never
// touches the network and writes no timestamps, so two runs on the same
// snapshot produce byte-identical output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const DOSSIER_TEXT_CAP = 65_536;

function flagValue(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const direct = args.indexOf(`--${name}`);
  if (direct !== -1 && args[direct + 1] !== undefined) return args[direct + 1]!;
  const joined = args.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(1);
}

const inputPath = flagValue('input', '/input');
const snapshotFile = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  fail(`no snapshot at ${snapshotFile} — pass --input <snapshot.json|dir> or mount the sealed /input`);
}
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model produced a board the gate refuses: ${problem}`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

function copyPlainFiles(fromDir: string, toDir: string): string[] {
  if (!existsSync(fromDir)) return [];
  mkdirSync(toDir, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(fromDir).sort()) {
    if (name.startsWith('.')) continue;
    const source = join(fromDir, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(toDir, name));
    names.push(name);
  }
  return names;
}

const dashFiles = copyPlainFiles(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
const shotFiles = copyPlainFiles(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
if (!dashFiles.includes('index.html')) fail('dashboard/ holds no index.html');
if (shotFiles.length < 3) fail(`screenshots/ holds ${shotFiles.length} images; the gate wants 3 or 4`);

const dossier = buildDossier(outputDir, {
  text_max_bytes: DOSSIER_TEXT_CAP,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// The judge reads the dashboard source through the dossier's text cap:
// warn loudly when the page outgrows it, because a cut source reads as a
// half-finished entry in a pairwise comparison.
const dashBytes = dashFiles.reduce(
  (sum, name) => sum + statSync(join(outputDir, 'dashboard', name)).size,
  0,
);
if (dashBytes > DOSSIER_TEXT_CAP) {
  process.stderr.write(
    `token-radar: warning: dashboard source is ${dashBytes} bytes, past the ${DOSSIER_TEXT_CAP}-byte ` +
      `dossier text cap — the judge would read a truncated page\n`,
  );
}

process.stdout.write(
  `token-radar: snapshot ${snapshot.as_of}: ${snapshot.protocols.length} protocols, ` +
    `${radar.watchlist_size} watchlist + ${radar.early_size} early = ${board.length} rows, ` +
    `${radar.live_size} token-bearing set aside as peer evidence\n` +
    `token-radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files, ${dashBytes} bytes), ` +
    `screenshots/ (${shotFiles.length} images) and dossier.json (${dossier.length} bytes) to ${outputDir}\n`,
);
