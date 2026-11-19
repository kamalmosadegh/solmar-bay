// Solmar Bay — the packaging program (Node 22+, standard library only).
//
// The game is plain static files under game/: index.html plus its ES modules,
// no build step and no network request, so any static server can host it.
// This program packages the game: it copies game/ and screenshots/ from
// beside this file into the output directory and writes summary.json there —
// a deterministic manifest of the package (path, size and SHA-256 of every
// file), after enforcing the package caps.
//
// Run it locally with:
//   mkdir -p out && OUTPUT_DIR=out node main.ts
// When OUTPUT_DIR is unset, /output is used.
// Serve the game locally with `node serve.ts` (http://localhost:8080).

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.OUTPUT_DIR ?? '/output';

/** Package caps: at most 4 screenshots of 256 KiB each, game/ at most 993 files and 48 MiB. */
const CAPS = {
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
};

function refuse(message: string): never {
  process.stderr.write(`solmar bay: ${message}\n`);
  process.exit(1);
}

// Validate the screenshots before copying anything.
const shotsDir = join(repoRoot, 'screenshots');
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length > CAPS.screenshots.max) {
  refuse(`screenshots/ holds ${shots.length} images: the cap is ${CAPS.screenshots.max}`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) {
    refuse(`screenshots/${name} is ${size} bytes: the cap is ${CAPS.screenshots.max_bytes}`);
  }
}

// Fresh output: game/ first, then the screenshots beside it.
mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

/** One file in the package manifest. */
interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * Write summary.json into `dir`: a deterministic manifest (path, size,
 * SHA-256) of every packaged file, after enforcing the package caps.
 */
function writeSummary(dir: string): void {
  const files: ManifestFile[] = [];
  const walk = (from: string, prefix: string): void => {
    for (const name of readdirSync(from).sort()) {
      if (prefix === '' && name === 'summary.json') continue;
      const path = join(from, name);
      if (statSync(path).isDirectory()) {
        walk(path, `${prefix}${name}/`);
        continue;
      }
      const data = readFileSync(path);
      files.push({ path: `${prefix}${name}`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    }
  };
  walk(dir, '');
  if (files.length > CAPS.game_max_files + CAPS.screenshots.max) {
    refuse(`the package holds ${files.length} files: the cap is ${CAPS.game_max_files + CAPS.screenshots.max}`);
  }
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > CAPS.game_max_bytes) {
    refuse(`the package is ${total} bytes: the cap is ${CAPS.game_max_bytes}`);
  }
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify({ schema: 'summary/v1', files }, null, 2)}\n`);
}

writeSummary(outDir);
