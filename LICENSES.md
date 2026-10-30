# Third-party licences

This project is MIT licensed (see `LICENSE`). This file lists every third-party package.

Assets: there are no third-party assets. App icons and UI icons are original art drawn in code
(`src/kit/scripts/lib/icon-art.mjs`, `src/kit/icons.ts`). Sounds are synthesised at runtime with
WebAudio. Text uses the system font stack.

## Bundled into the game

| Package | Licence | Use |
| --- | --- | --- |
| three (three.js), including `three/examples/jsm` add-ons (EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, RoomEnvironment, RoundedBoxGeometry) | MIT, Copyright 2010-2026 three.js authors | 3D rendering |
| `src/kit/` (499apps games-kit) | MIT, Copyright (c) 2026 499apps | Shared runtime (vendored) |

## Development only (not shipped)

| Package | Licence |
| --- | --- |
| typescript | Apache-2.0 |
| vite | MIT |
| vitest | MIT |
| fast-check | MIT |
| @playwright/test, playwright | Apache-2.0 |
| eslint, @eslint/js | MIT |
| typescript-eslint | MIT |
| eslint-config-prettier | MIT |
| globals | MIT |
| prettier | MIT |
| @types/node, @types/three | MIT |

## Rules

- Only MIT, CC0, OFL or Apache-2.0 code may be added. Assets must be CC0 or MIT.
- Add every new dependency to this file in the same change.
