/**
 * App shell: theme CSS, left menu with the standard items, audio unlock, service worker
 * registration and test-mode hooks. Every page (hub, privacy, each game) boots through this.
 */
import { attachAutoUnlock, createSynth, type Synth } from './audio';
import { HUB_BASE, PRIVACY_URL } from './csp';
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen';
import { prefersReducedMotion } from './lifecycle';
import { createMenu, type Menu, type MenuItem } from './menu';
import { clearAllUserData, storage, type KitStorage } from './storage';
import { isAssembledBuild, registerServiceWorker } from './sw-register';
import { readTestMode, type TestModeState } from './test-mode';
import { applyThemeCss } from './theme';

export type ShellKind = 'hub' | 'game' | 'page';

export interface ShellOptions {
  /** Short title for the rail header, e.g. "Snake". */
  title: string;
  kind: ShellKind;
  /** Where the menu root is appended. */
  container: HTMLElement;
  /** import.meta.env.BASE_URL */
  base: string;
  /** import.meta.env.DEV (no service worker in dev). */
  dev?: boolean;
  /** Extra items inserted after Home (restart, mode select ...). */
  extraItems?: MenuItem[];
  onClearData?: () => void;
  onMenuActivate?: (id: string) => void;
}

export interface Shell {
  synth: Synth;
  storage: KitStorage;
  menu: Menu;
  testMode: TestModeState;
  reducedMotion: boolean;
  assembled: boolean;
  destroy(): void;
}

export function createShell(o: ShellOptions): Shell {
  applyThemeCss();
  document.body.classList.add(`g499-kind-${o.kind}`);
  const testMode = readTestMode();
  if (testMode.enabled) document.documentElement.classList.add('g499-test');
  // Test pages never touch a real audio device (headless hosts have none).
  const synth = createSynth(storage, { silent: testMode.enabled });
  const detachUnlock = attachAutoUnlock(synth);
  const assembled = isAssembledBuild();
  const reducedMotion = prefersReducedMotion();

  const items: MenuItem[] = [];
  items.push({ kind: 'link', id: 'home', label: 'Games', icon: 'home', href: HUB_BASE });
  if (o.extraItems) items.push(...o.extraItems);
  items.push({
    kind: 'toggle',
    id: 'mute',
    label: 'Sound on',
    labelOff: 'Sound off',
    icon: 'sound',
    iconOff: 'soundOff',
    get: () => !synth.muted,
    set: (on) => synth.setMuted(!on),
  });
  items.push({
    kind: 'toggle',
    id: 'fullscreen',
    label: 'Exit fullscreen',
    labelOff: 'Fullscreen',
    icon: 'fullscreenExit',
    iconOff: 'fullscreen',
    get: () => isFullscreen(),
    set: () => {
      void toggleFullscreen();
    },
  });
  items.push({ kind: 'link', id: 'privacy', label: 'Privacy', icon: 'shield', href: PRIVACY_URL });
  items.push({
    kind: 'hold',
    id: 'clear',
    label: 'Clear my data',
    icon: 'broom',
    holdMs: 1200,
    doneLabel: 'Cleared',
    onConfirm: async () => {
      await clearAllUserData(storage);
      synth.reload();
      menu.refresh();
      o.onClearData?.();
    },
  });

  const menu = createMenu({
    container: o.container,
    items,
    title: o.title,
    onActivate: (id) => {
      if (id !== 'mute' || !synth.muted) synth.tick();
      o.onMenuActivate?.(id);
    },
  });
  if (!fullscreenSupported()) menu.setHidden('fullscreen', true);
  const offFs = onFullscreenChange(() => menu.refresh());
  const offMute = synth.onMuteChange(() => menu.refresh());

  void registerServiceWorker({ base: o.base, assembled, skip: o.dev === true });

  return {
    synth,
    storage,
    menu,
    testMode,
    reducedMotion,
    assembled,
    destroy() {
      detachUnlock();
      offFs();
      offMute();
      menu.dispose();
      synth.dispose();
    },
  };
}
