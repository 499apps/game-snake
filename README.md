# game-snake

**3D Snake** for 499apps Games: guide a friendly, glossy snake to the fruit.
It plays at `https://499apps.com/games/snake/`.

- Three speeds, picked with an icon in the left menu: turtle (easy), rabbit (normal), lightning (fast).
- Easy: the edges wrap around (low blue rim). Normal and fast: a wall bump ends the round gently (tall pink rim).
- Quick meals raise a combo (up to x5). Each mode keeps its own best score.
- At the end of a round, the snake curls up and goes to sleep. Tap to play again.

## The privacy promise

- The game collects nothing. No accounts, ads, analytics, cookies or trackers.
- After the page loads, it makes no network calls and links to no other site.
- The best scores, the mode and the d-pad setting stay on your device, in `localStorage` keys that start with `g499:snake:`.
- "Clear my data" in the left menu (hold the button) removes all `g499:` keys.
- After the first visit, the game works offline.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Steer | Swipe anywhere, or the on-screen d-pad | Arrows or WASD | D-pad or left stick |
| Start, pause, play again | Tap, or the round d-pad button | Space or Enter | A |
| Pause | Menu button (left) | P or Escape | Start |

Turn the on-screen d-pad on or off in the left menu. It is on by default on touch screens.

## Code map

| File | What it does |
| --- | --- |
| `src/logic.ts` | Pure rules: grid, moves, input buffer (2 turns, no reversal), growth, food, modes, score, combo |
| `src/controller.ts` | Fixed-step clock, pause, start and restart (no DOM) |
| `src/scene.ts` | three.js scene: board, tube body, face, food, particles, camera |
| `src/game/*` | Spine sampler, tube mesh, head, food, board, camera framing |
| `src/main.ts` | Page wiring: menu items, HUD, overlays, d-pad, sounds |

Unit and property tests (Vitest + fast-check) cover the rules, the controller, the spine and the framing.
All randomness uses the kit's seeded PRNG, so a seed plus an input script replays the same round.

## Run it

Use Node 20.19 or later and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit   # once, for the smoke tests
pnpm dev            # http://localhost:5174/games/snake/
pnpm build          # dist/ with icons and this game's own service worker
pnpm preview        # http://localhost:4174/games/snake/
pnpm ci:local       # typecheck, lint, unit tests, scan:secrets, build, smoke tests
```

## How it fits into 499apps.com/games

- Standalone, the game registers its own service worker (scope `/games/snake/`) and manifest.
- The hub repo (`499apps/games`) builds this repo with `VITE_ASSEMBLED=1`.
  Then the page uses the hub manifest and the single `/games/sw.js` worker.
- `src/kit/` is a vendored copy of `499apps/games-kit`. Do not edit it here. Run `pnpm kit:sync`.

## Licence

MIT. See `LICENSE`. Third-party packages are in `LICENSES.md`.
