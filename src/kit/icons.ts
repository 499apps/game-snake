/**
 * Original inline SVG icons (24x24, stroke based). No external icon fonts or files.
 */

export type IconName =
  | 'home'
  | 'sound'
  | 'soundOff'
  | 'shield'
  | 'broom'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'menu'
  | 'close'
  | 'pause'
  | 'play'
  | 'palette'
  | 'snake'
  | 'rocket'
  | 'info'
  | 'check'
  | 'back'
  | 'games'
  | 'restart';

const paths: Record<IconName, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/>',
  sound:
    '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.8 7a7 7 0 0 1 0 10"/>',
  soundOff:
    '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="m16 9.5 5 5"/><path d="m21 9.5-5 5"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5z"/><path d="m9 12 2 2 4-4"/>',
  broom:
    '<path d="M14.5 3.5 10 8"/><path d="m10 8 4.5 4.5"/><path d="M7.5 10.5 13.5 16.5c-2 2.5-5.5 3.5-9 3.5.5-3.5 1.5-7 3-9.5z"/><path d="M6 15.5 9.5 19"/>',
  fullscreen:
    '<path d="M4 9V4h5"/><path d="M15 4h5v5"/><path d="M20 15v5h-5"/><path d="M9 20H4v-5"/>',
  fullscreenExit:
    '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M20 15h-5v5"/><path d="M4 15h5v5"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-.9-.6-1.3-.6-2 0-.9.7-1.4 1.6-1.4h1.5a4 4 0 0 0 4-4c0-4.3-3.9-7.9-8.5-7.9z"/><circle cx="7.5" cy="12" r="1.2"/><circle cx="9.5" cy="8" r="1.2"/><circle cx="14" cy="7.5" r="1.2"/><circle cx="17" cy="10.5" r="1.2"/>',
  snake:
    '<path d="M5 17c0 2 2 3 4 3 3 0 3-4 0-4s-3-4 0-4 4-2 4-4-2-3-4-3"/><circle cx="16.5" cy="7" r="2.5"/><path d="M19 7h1.5"/>',
  rocket:
    '<path d="M12 3c3 2 4.5 6 4.5 9.5l-1.5 3h-6l-1.5-3C7.5 9 9 5 12 3z"/><path d="M9 15.5 7 18.5h10l-2-3"/><circle cx="12" cy="10" r="1.5"/><path d="M10.5 18.5 12 21l1.5-2.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  games:
    '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3"/><path d="M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="17.5" cy="13.5" r=".8"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
};

export function iconSvg(name: IconName, className = 'g499-icon-svg'): string {
  const d = paths[name];
  return `<svg class="${className}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

export function iconElement(name: IconName): HTMLElement {
  const span = document.createElement('span');
  span.className = 'g499-icon';
  span.innerHTML = iconSvg(name);
  return span;
}
