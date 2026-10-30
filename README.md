# game-snake

**3D Snake** for 499apps Games: guide a friendly, glossy snake to the apples.
It plays at `https://499apps.com/games/snake/`.

Status: scaffold. The 3D board, the preview snake, the left menu, offline support and local CI work.
The full game comes next (task G2).

## The privacy promise

- The game collects nothing. No accounts, ads, analytics, cookies or trackers.
- After the page loads, it makes no network calls and links to no other site.
- The best score stays on your device, in `localStorage` keys that start with `g499:snake:`.
- "Clear my data" in the left menu (hold the button) removes all `g499:` keys.
- After the first visit, the game works offline.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Steer | Swipe | Arrows or WASD | D-pad or left stick |
| Hop | Tap | Space or Enter | A |
| Pause | (menu) | P | Start |

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
