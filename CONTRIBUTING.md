# Contributing

Thank you for your help. Read these rules before you open a pull request.

## Local CI only

- This project has no GitHub Actions. Do not add a `.github/workflows` folder.
- Run `pnpm ci:local` before you open a pull request. It must pass.
- New visual baselines: run `pnpm e2e:update`, check the images, and commit them.

## Clean-room and licensing

- Write original code for public game mechanics. Do not copy code, sprites, sounds or ROMs.
- Do not use trademarked names, logos or brand trade dress. Use generic names.
- Third-party code must be MIT, CC0, OFL or Apache-2.0. Assets must be CC0 or MIT.
- List every bundled package or asset in `LICENSES.md`.

## Privacy rules

- No network requests after load. No `fetch`, XHR, WebSocket or beacon calls.
  The service worker precache of same-origin files is the only exception.
- No analytics, cookies, ads, accounts, fingerprinting or external links.
- Store data in `localStorage` only, through the kit storage. Every key starts with `g499:`.
- Keep the Content-Security-Policy meta tag. No inline scripts, no `'unsafe-eval'`.
- Do not commit secrets, personal e-mail addresses or absolute user paths. `pnpm scan:secrets` checks this.

## Kid-friendly rules

- No violence. Mistakes get a gentle bounce or a soft sound, never a harsh one.
- Playable with no reading. Touch targets are 56 px or larger.
- Respect `prefers-reduced-motion`. Pause when the page is hidden.

## Design rule: menus on the left

- All menus and settings go in the left rail (tablet and desktop).
- On phones, the rail becomes a left drawer. A left-edge button opens it.
- Never put menus top-right or on the right side. HUD readouts may go where gameplay needs them.

## Shared kit

- `src/kit/` is vendored from `499apps/games-kit`. Do not edit it here.
- Change the kit in its repo, run `pnpm kit:sync` here, and commit `src/kit/` and `kit.lock`.

## Code style

- TypeScript strict mode. Prettier formats the code (`pnpm format`).
- Keep game rules in pure modules (`src/game/`) with Vitest tests. Randomness goes through the kit PRNG.
