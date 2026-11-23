# gta6-01-3d
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/czrmmlxh-stack/gta6-01-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/czrmmlxh-stack/gta6-01-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunvale 3D is a 3D open-world crime game set in the fictional coastal city of Sunvale. You arrive with nothing but a borrowed jacket and a debt to a fixer named Marla — earn your way out by driving, stealing cars, outrunning the police, and finishing her ten jobs.

## How to run it

```bash
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no accounts, no network — the game runs fully offline once the page is loaded.

## Controls

- **WASD / arrow keys** — move on foot, drive when in a car
- **E** — enter / exit / steal a car
- **Space or mouse click** — punch, or shoot if you have the pistol
- **Shift** — sprint
- **P** — pause

## What is in the game

- A 3D city rendered with three.js (vendored as a single `three.min.js` file under `game/vendor/`), with streets, buildings, traffic, and pedestrians
- Driving: steer cars, ram through the streets, bail out at speed
- Wanted system: heat runs from 0 to 5 stars, police cars and foot cops chase you, a helicopter arrives at 3 stars, roadblocks go up on the roads ahead, and lying low lets the heat decay
- Ten story missions for Marla — borrow rides, run packages across town, meet contacts, break dragnets, and pull off the big score — each paying out in cash, from $150 to $1,500
- A garage that repairs your ride, repaints it, and pays you for the trouble; a respect system that grows as the streets learn your name
- Combat on foot, a HUD with health, money, stars, a mission tracker, a police dispatch ticker, stats, speed and radio, plus a minimap
- Golden-hour lighting: PBR materials, soft shadows that follow the camera, recessed window facades, rounded cars, layered trees
- Save progress in localStorage; start screen, pause, and game-over / restart flow
- Deterministic scenes for screenshots via `?shot=start|play|chase|end`

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.
