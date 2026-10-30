/**
 * Snake (scaffold): boots the kit shell (left rail, audio, service worker), the 3D stage and the
 * preview scene. Swipe, arrows, WASD or the d-pad steer; tap, Space or A makes the snake hop.
 */
import './kit/styles.css';
import './game.css';
import { isDirection } from './kit/input';
import { createShell } from './kit/shell';
import { createStage } from './kit/stage';
import { SnakeScene } from './scene';

const BEST_KEY = 'snake:best';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`snake: missing ${selector}`);
  return el;
}

const stageHost = must<HTMLElement>('#stage');
const scoreEl = must<HTMLElement>('#score');
const bestEl = must<HTMLElement>('#best');
const pauseOverlay = must<HTMLElement>('#pause');
const resumeButton = must<HTMLButtonElement>('#resume');

let scene: SnakeScene | null = null;

const shell = createShell({
  title: 'Snake',
  kind: 'game',
  container: document.body,
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
  extraItems: [
    {
      kind: 'button',
      id: 'restart',
      label: 'Restart',
      icon: 'restart',
      onSelect: () => {
        scene?.reset();
        setPaused(false);
        renderHud();
        stage.requestRender();
      },
    },
  ],
  onClearData: () => renderHud(),
});

const stage = createStage({
  host: stageHost,
  testMode: shell.testMode,
  reducedMotion: shell.reducedMotion,
  label: 'Snake game board',
  fallback: { title: 'Snake', text: 'This game needs WebGL, which this browser does not offer.' },
});

let actions = 0;

function best(): number {
  return shell.storage.get<number>(BEST_KEY, 0);
}

function renderHud(): void {
  const eaten = scene ? scene.state.eaten : 0;
  scoreEl.textContent = String(eaten);
  bestEl.textContent = String(Math.max(best(), eaten));
}

function setPaused(p: boolean): void {
  scene?.setPaused(p);
  pauseOverlay.hidden = !p;
  if (p) resumeButton.focus({ preventScroll: true });
  // Frozen test mode draws on demand.
  stage.requestRender();
}

if (stage.kit) {
  const kit = stage.kit;
  const s = new SnakeScene(kit, stage.rng, {
    reducedMotion: shell.reducedMotion,
    onEat: (eaten) => {
      shell.synth.success();
      if (eaten > best()) shell.storage.set(BEST_KEY, eaten);
      renderHud();
    },
  });
  scene = s;
  stage.run({
    update: (dt, t) => s.update(dt, t),
    onResize: (w, h) => s.resize(w, h),
  });
}

stage.input.on((action) => {
  actions++;
  if (isDirection(action)) {
    scene?.steer(action);
    shell.synth.blip();
    return;
  }
  switch (action) {
    case 'primary':
      if (scene?.isPaused) setPaused(false);
      else {
        scene?.bounce();
        shell.synth.pop();
      }
      return;
    case 'pause':
      setPaused(!(scene?.isPaused ?? false));
      return;
    case 'mute':
      shell.synth.toggleMuted();
      return;
    default:
      return;
  }
});

resumeButton.addEventListener('click', () => setPaused(false));

renderHud();
stage.ready(() => ({
  actions,
  dir: scene ? scene.state.dir : null,
  eaten: scene ? scene.state.eaten : 0,
  length: scene ? scene.state.body.length : 0,
  tick: scene ? scene.state.tick : 0,
  paused: scene ? scene.isPaused : false,
}));
