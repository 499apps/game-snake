/**
 * Snake: boots the kit shell (left rail, audio, service worker) and the 3D stage, then wires the
 * game controller to the scene, sounds, HUD, overlays and the on-screen d-pad.
 *
 * Controls: swipe, arrows, WASD, the d-pad or a gamepad steer; tap, Space or A starts and
 * pauses. Mode, pause, restart, d-pad, sound, home and clear-data live in the left rail.
 */
import './kit/styles.css';
import './game.css';
import { isDirection, type Direction } from './kit/input';
import { createRng } from './kit/prng';
import { createShell } from './kit/shell';
import { createStage } from './kit/stage';
import { storage } from './kit/storage';
import { readTestMode } from './kit/test-mode';
import { GameController, type ControllerEvents } from './controller';
import { layoutInsets, type Insets } from './game/framing';
import * as THREE from 'three';
import { SNAKE_BLOOM_THRESHOLD } from './game/glow';
import type { Cell } from './game/grid';
import { MODE_ICON, MODE_LABEL, snakeIcon } from './icons';
import {
  BOARD_SIZE,
  bestKey,
  modeFromStored,
  nextMode,
  sanitizeBest,
  type Mode,
  type SnakeState,
} from './logic';
import { SnakeScene } from './scene';
import { SnakeSounds } from './sound';

const MODE_KEY = 'snake:mode';
const DPAD_KEY = 'snake:dpad';
const GARDEN_KEY = 'snake:garden';
/** Seconds after the end before the game-over card slides in (the snake curls up first). */
const OVER_CARD_DELAY = 1.3;
const MAX_POPS = 6;

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`snake: missing ${selector}`);
  return el;
}

const appEl = must<HTMLElement>('.game-app');
const stageHost = must<HTMLElement>('#stage');
const popsEl = must<HTMLElement>('#pops');
const hudEl = must<HTMLElement>('.g499-hud');
const scoreEl = must<HTMLElement>('#score');
const bestEl = must<HTMLElement>('#best');
const startEl = must<HTMLElement>('#start');
const startBtn = must<HTMLButtonElement>('#start-btn');
const startModeBtn = must<HTMLButtonElement>('#start-mode');
const startModeIcon = must<HTMLElement>('#start-mode-icon');
const startModeLabel = must<HTMLElement>('#start-mode-label');
const pauseOverlay = must<HTMLElement>('#pause');
const resumeButton = must<HTMLButtonElement>('#resume');
const overOverlay = must<HTMLElement>('#over');
const overIcon = must<HTMLElement>('#over-icon');
const overScore = must<HTMLElement>('#over-score');
const overBest = must<HTMLElement>('#over-best');
const overBestPill = must<HTMLElement>('#over-best-pill');
const againButton = must<HTMLButtonElement>('#again');
const dpadEl = must<HTMLElement>('#dpad');
const padPrimary = must<HTMLButtonElement>('#pad-primary');
const padPrimaryIcon = must<HTMLElement>('#pad-primary-icon');
const safeProbe = must<HTMLElement>('#safe-probe');

// Rules randomness has its own seeded stream (the scene's particles use the stage's), so a seed
// plus the same inputs always replays the same round.
const testMode = readTestMode();
const seed = testMode.enabled ? testMode.seed : Math.floor(Math.random() * 0xffffffff);

function storedMode(): Mode {
  // Key "snake:mode" is stored as "g499:snake:mode" by the kit storage.
  return modeFromStored(storage.get<unknown>(MODE_KEY, null));
}

/** Garden boards (seeded soft bushes) are optional and off until the player turns them on. */
let gardenOn = storage.get<unknown>(GARDEN_KEY, false) === true;

function bestFor(mode: Mode): number {
  return sanitizeBest(storage.get<unknown>(bestKey(mode, gardenOn), 0));
}

let scene: SnakeScene | null = null;
let actions = 0;
let bestAtStart = bestFor(storedMode());
let overShown = false;
let dpadOn = (() => {
  const saved = storage.get<unknown>(DPAD_KEY, null);
  if (typeof saved === 'boolean') return saved;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
})();

const events: ControllerEvents = {
  onReset: (s) => {
    scene?.reset(s);
    bestAtStart = bestFor(s.mode);
    hideOver();
    renderHud();
    updateUi();
  },
  onStart: () => {
    sounds.start();
    bestAtStart = bestFor(game.mode);
    updateUi();
  },
  onEat: (cell, points, s) => {
    scene?.onEat(cell, s);
    sounds.eat(s.combo);
    showPop(cell, points, s.combo);
    if (s.score > bestFor(s.mode)) shell.storage.set(bestKey(s.mode, gardenOn), s.score);
    renderHud();
  },
  onEnd: (s) => {
    scene?.onEnd(s);
    if (s.cause === 'full') sounds.win();
    else {
      sounds.bump();
      sounds.sleep();
    }
    if (s.score > bestFor(s.mode)) shell.storage.set(bestKey(s.mode, gardenOn), s.score);
    renderHud();
    updateUi();
  },
  onPause: (p) => {
    if (p) sounds.pause();
    else sounds.resume();
    updateUi();
  },
  onTurn: () => sounds.turn(),
};

const game = new GameController(createRng(seed ^ 0x5eed5), storedMode(), events, BOARD_SIZE, {
  garden: gardenOn,
});

const shell = createShell({
  title: 'Snake',
  kind: 'game',
  container: document.body,
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
  extraItems: [
    {
      kind: 'toggle',
      id: 'pause',
      label: 'Play',
      labelOff: 'Pause',
      icon: 'play',
      iconOff: 'pause',
      get: () => game.paused,
      set: (p) => setPaused(p),
    },
    {
      kind: 'button',
      id: 'restart',
      label: 'Restart',
      icon: 'restart',
      onSelect: () => {
        game.reset();
        shell.menu.close();
        stage.requestRender();
      },
    },
    {
      kind: 'button',
      id: 'mode',
      label: MODE_LABEL[game.mode],
      icon: 'games',
      onSelect: () => setMode(nextMode(game.mode)),
    },
    {
      kind: 'toggle',
      id: 'dpad',
      // Short label (fits the rail); the toggle state shows in colour and aria-pressed.
      label: 'D-pad',
      icon: 'games',
      get: () => dpadOn,
      set: (on) => setDpad(on),
    },
    {
      kind: 'button',
      id: 'garden',
      label: 'Garden',
      icon: 'games',
      onSelect: () => setGarden(!gardenOn),
    },
  ],
  onClearData: () => {
    bestAtStart = 0;
    renderHud();
  },
});

const sounds = new SnakeSounds(shell.synth);

const stage = createStage({
  host: stageHost,
  testMode: shell.testMode,
  reducedMotion: shell.reducedMotion,
  label: 'Snake game board',
  fallback: { title: 'Snake', text: 'This game needs WebGL, which this browser does not offer.' },
  renderer: {
    // Neutral keeps the pink rim pink and the snake green; ACES pushed both to white (g7).
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.85,
    bloom: { strength: 0.5, radius: 0.5, threshold: SNAKE_BLOOM_THRESHOLD },
    vignette: 0.3,
  },
});

// ---------- HUD, overlays, pops ----------

function renderHud(): void {
  const s = game.state;
  scoreEl.textContent = String(s.score);
  bestEl.textContent = String(Math.max(bestFor(s.mode), s.score));
}

function renderModeItem(): void {
  const btn = shell.menu.rail.querySelector<HTMLElement>('[data-menu-id="mode"]');
  if (btn) {
    const icon = btn.querySelector('.g499-icon');
    if (icon) icon.innerHTML = snakeIcon(MODE_ICON[game.mode]);
    const label = btn.querySelector('.g499-label');
    if (label) label.textContent = MODE_LABEL[game.mode];
    btn.setAttribute('aria-label', `Speed: ${MODE_LABEL[game.mode]}`);
  }
  startModeIcon.innerHTML = snakeIcon(MODE_ICON[game.mode]);
  startModeLabel.textContent = MODE_LABEL[game.mode];
  startModeBtn.setAttribute('aria-label', `Speed: ${MODE_LABEL[game.mode]} (tap to change)`);
  startModeBtn.dataset['mode'] = game.mode;
}

function renderGardenItem(): void {
  const btn = shell.menu.rail.querySelector<HTMLElement>('[data-menu-id="garden"]');
  if (!btn) return;
  btn.classList.add('g499-menu-toggle');
  btn.classList.toggle('is-on', gardenOn);
  btn.setAttribute('aria-pressed', gardenOn ? 'true' : 'false');
  btn.setAttribute('aria-label', 'Garden board with bushes');
  const icon = btn.querySelector('.g499-icon');
  if (icon) icon.innerHTML = snakeIcon('bush');
}

function updateUi(): void {
  const s = game.state;
  startEl.hidden = s.phase !== 'ready';
  pauseOverlay.hidden = !game.paused;
  if (s.phase !== 'over') hideOver();
  const showPause = s.phase === 'playing' && !game.paused;
  padPrimaryIcon.innerHTML = snakeIcon(showPause ? 'pause' : 'play', 'snake-pad-svg', true);
  padPrimary.setAttribute('aria-label', showPause ? 'Pause' : 'Play');
  shell.menu.refresh();
  stage.requestRender();
}

function showOver(s: SnakeState): void {
  overShown = true;
  const best = bestFor(s.mode);
  const isNew = s.score > 0 && s.score > bestAtStart;
  overScore.textContent = String(s.score);
  overBest.textContent = String(Math.max(best, s.score));
  overBestPill.classList.toggle('is-new', isNew);
  const win = s.cause === 'full';
  overIcon.innerHTML = snakeIcon(win ? 'star' : 'moon', 'g499-icon-svg', win);
  overIcon.classList.toggle('is-win', win);
  overOverlay.hidden = false;
  if (isNew) sounds.newBest();
}

function hideOver(): void {
  overShown = false;
  overOverlay.hidden = true;
}

function showPop(cell: Cell, points: number, combo: number): void {
  if (!scene) return;
  const p = scene.cellToScreen(cell);
  while (popsEl.childElementCount >= MAX_POPS) popsEl.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = combo >= 2 ? 'snake-pop is-combo' : 'snake-pop';
  el.textContent = combo >= 2 ? `+${points} x${combo}` : `+${points}`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  popsEl.append(el);
  setTimeout(() => el.remove(), shell.reducedMotion ? 700 : 950);
}

// ---------- Layout: keep the board clear of the HUD, the drawer button and the d-pad ----------

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function measureInsets(): Insets {
  const host = stageHost.getBoundingClientRect();
  const probe = getComputedStyle(safeProbe);
  const rel = (r: DOMRect) => ({
    left: r.left - host.left,
    top: r.top - host.top,
    right: r.right - host.left,
    bottom: r.bottom - host.top,
  });
  const toggle = shell.menu.toggleButton;
  return layoutInsets({
    width: host.width,
    height: host.height,
    hudBottom: hudEl.getBoundingClientRect().bottom - host.top,
    toggle: getComputedStyle(toggle).display !== 'none' ? rel(toggle.getBoundingClientRect()) : null,
    dpad: dpadEl.hidden ? null : rel(dpadEl.getBoundingClientRect()),
    safeRight: px(probe.paddingRight),
    safeBottom: px(probe.paddingBottom),
  });
}

/** Put the start button over the board, a little in front of the snake. */
function placeStart(): void {
  if (!scene) return;
  const host = stageHost.getBoundingClientRect();
  const app = appEl.getBoundingClientRect();
  const p = scene.cellToScreen({ x: Math.floor(BOARD_SIZE / 2), y: BOARD_SIZE - 3 });
  // Set on the container: the Play button and the speed button both use it.
  startEl.style.setProperty('--snake-start-x', `${p.x + host.left - app.left}px`);
  startEl.style.setProperty('--snake-start-y', `${p.y + host.top - app.top}px`);
}

function relayout(): void {
  const kit = stage.kit;
  if (!kit || !scene) return;
  scene.resize(kit.width, kit.height, measureInsets());
  placeStart();
  stage.requestRender();
}

// ---------- Actions ----------

function setPaused(p: boolean): void {
  game.setPaused(p);
  updateUi();
}

function setMode(mode: Mode): void {
  shell.storage.set(MODE_KEY, mode);
  game.reset(mode);
  renderModeItem();
  shell.menu.close();
}

/** Garden boards on or off: a fresh round with (or without) seeded bushes. */
function setGarden(on: boolean): void {
  gardenOn = on;
  shell.storage.set(GARDEN_KEY, on);
  game.setGarden(on);
  renderGardenItem();
  shell.menu.close();
}

function setDpad(on: boolean): void {
  dpadOn = on;
  shell.storage.set(DPAD_KEY, on);
  dpadEl.hidden = !on;
  relayout();
}

function primary(): void {
  game.primary();
  updateUi();
}

function steer(dir: Direction): void {
  game.steer(dir);
  updateUi();
}

// ---------- Wiring ----------

// Before the first resize, so the first framing already leaves room for the d-pad.
dpadEl.hidden = !dpadOn;

if (stage.kit) {
  const kit = stage.kit;
  const s = new SnakeScene(kit, stage.rng, { reducedMotion: shell.reducedMotion, size: BOARD_SIZE });
  scene = s;
  s.reset(game.state);
  stage.run({
    update: (dt, t) => {
      game.update(dt);
      const st = game.state;
      if (st.phase === 'over' && !overShown && game.endedFor >= OVER_CARD_DELAY) showOver(st);
      s.update(dt, t, {
        state: st,
        prevBody: game.prevBody,
        alpha: game.alpha,
        paused: game.paused,
        endedFor: game.endedFor,
      });
    },
    onResize: (w, h) => {
      s.resize(w, h, measureInsets());
      placeStart();
    },
  });
}

stage.input.on((action) => {
  actions++;
  if (isDirection(action)) {
    steer(action);
    return;
  }
  switch (action) {
    case 'primary':
      primary();
      return;
    case 'pause':
      if (game.state.phase === 'playing') setPaused(!game.paused);
      return;
    case 'menu':
      if (game.state.phase === 'playing' && !game.paused) setPaused(true);
      return;
    case 'mute':
      shell.synth.toggleMuted();
      return;
    default:
      return;
  }
});

// D-pad: react on press (not release) so steering feels instant.
for (const btn of Array.from(dpadEl.querySelectorAll<HTMLButtonElement>('.snake-pad'))) {
  const dir = btn.dataset['dir'];
  const fire = () => {
    if (isDirection(dir as Direction)) stage.input.emit(dir as Direction, 'touch');
    else stage.input.emit('primary', 'touch');
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    btn.classList.add('is-pressed');
    fire();
  });
  const release = () => btn.classList.remove('is-pressed');
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  // Keyboard activation (Enter on a focused pad button) arrives as a click with no pointer.
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fire();
  });
}

startBtn.addEventListener('click', () => {
  actions++;
  primary();
});
// Start screen: one big button cycles the speed (Easy, Normal, Fast), no drawer needed.
startModeBtn.addEventListener('click', () => {
  actions++;
  shell.synth.tick();
  setMode(nextMode(game.mode));
});
resumeButton.addEventListener('click', () => setPaused(false));
pauseOverlay.addEventListener('click', (e) => {
  if (e.target === pauseOverlay) setPaused(false);
});
againButton.addEventListener('click', () => {
  actions++;
  if (game.state.phase === 'over') {
    game.reset();
    game.begin();
  }
  updateUi();
});

// Opening the drawer on a phone pauses the round.
shell.menu.toggleButton.addEventListener('click', () => {
  if (shell.menu.isOpen() && game.state.phase === 'playing') setPaused(true);
});

// Leaving the page (tab switch, app switch) pauses; the round waits for the player.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game.state.phase === 'playing') setPaused(true);
});

renderModeItem();
renderGardenItem();
renderHud();
updateUi();
relayout();

stage.ready(() => {
  const s = game.state;
  return {
    actions,
    phase: s.phase,
    mode: s.mode,
    dir: s.dir,
    queued: s.queued.length,
    head: s.body[0] ?? null,
    food: s.food,
    score: s.score,
    eaten: s.eaten,
    length: s.body.length,
    tick: s.tick,
    paused: game.paused,
    cause: s.cause,
    garden: gardenOn,
    bushes: s.bushes.length,
    best: bestFor(s.mode),
    stepFrames: Math.floor(game.interval * 60),
  };
});
