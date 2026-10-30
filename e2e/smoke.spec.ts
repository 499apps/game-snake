import { defineSmokeSuite } from '../src/kit/smoke/suite';

defineSmokeSuite([
  {
    name: 'snake',
    path: '/games/snake/',
    webgl: true,
    swScope: '/games/snake/',
    manifest: { scope: '/games/snake/', startUrl: '/games/snake/' },
    play: { keys: ['ArrowUp', 'ArrowLeft', 'Space'], swipes: ['up', 'left'], tap: true },
    clearSelector: '[data-menu-id="clear"]',
  },
]);
