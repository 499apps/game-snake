/**
 * Original Snake icons (24x24, stroke based, same style as the kit icons). The mode icons say
 * the speed without words: turtle = easy, rabbit = normal, lightning = fast.
 */
import type { Mode } from './logic';

const paths = {
  turtle:
    '<path d="M3 16c0-4.4 3.4-8 7.5-8s7.5 3.6 7.5 8z"/><circle cx="20.3" cy="13.2" r="2"/><path d="M6 16v2.5"/><path d="M15 16v2.5"/><path d="M7.5 9.6 10.5 16l3-6.4"/>',
  rabbit:
    '<path d="M9.2 10.2C8 7.8 7.7 4.6 8.6 3c1.6.5 2.7 3.6 2.7 6.6"/><path d="M14.8 10.2c1.2-2.4 1.5-5.6.6-7.2-1.6.5-2.7 3.6-2.7 6.6"/><circle cx="12" cy="15.2" r="5.6"/><path d="M10 14.6h.01"/><path d="M14 14.6h.01"/><path d="M11 17.6c.6.4 1.4.4 2 0"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  arrow: '<path d="M12 5v14"/><path d="m6 11 6-6 6 6"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  again: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
  bush: '<path d="M3.5 19h17"/><path d="M6.5 19a3.5 3.5 0 0 1 .3-7 5 5 0 0 1 9.4-1.2A3.8 3.8 0 0 1 17.5 19"/><path d="M12 19v-4"/>',
} as const;

export type SnakeIcon = keyof typeof paths;

export const MODE_ICON: Readonly<Record<Mode, SnakeIcon>> = {
  easy: 'turtle',
  normal: 'rabbit',
  fast: 'bolt',
};

export const MODE_LABEL: Readonly<Record<Mode, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  fast: 'Fast',
};

export function snakeIcon(name: SnakeIcon, className = 'g499-icon-svg', filled = false): string {
  const fill = filled ? 'currentColor' : 'none';
  return `<svg class="${className}" viewBox="0 0 24 24" width="24" height="24" fill="${fill}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
