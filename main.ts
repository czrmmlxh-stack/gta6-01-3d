// Sunvale 3D — a gta6-01 entry (Node 22, standard library only): a 3D open-world crime
// game in this directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, three.js vendored under game/vendor/, no network
// request). The player is a newcomer driver in Sunvale, a sun-soaked coastal city, working
// jobs for Marla, who runs the crew: on foot and by car, stealing cars, dodging a wanted
// level and the police who answer it (chase cars, a helicopter at 3 stars, roadblocks),
// with traffic, pedestrians, a garage that repairs and repaints, respect that grows job by
// job, and 20 story missions — "The Viper War" — worth $36,150 in all, fighting a rival gang
// for Marla's turf. HUD with wanted stars, cash, respect and a minimap; title, pause and
// game-over screens; save progress and synthesized sound. The program hands it in: it copies
// game/ and screenshots/ from beside this file to /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library. Put your 3 or 4 PNG or
// JPEG screenshots in screenshots/ (the first by name is the cover) and run it. It exits
// when the handoff is done: it starts no server and waits for nothing.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
