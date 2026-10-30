/**
 * Left-side menu: a fixed rail on tablets/desktops, a slide-out drawer opened by a
 * left-edge button on phones. All navigation and settings controls live here.
 * Design rule: menus are always on the left.
 */
import { iconSvg, type IconName } from './icons';

export interface MenuLinkItem {
  kind: 'link';
  id: string;
  label: string;
  icon: IconName;
  href: string;
}

export interface MenuButtonItem {
  kind: 'button';
  id: string;
  label: string;
  icon: IconName;
  onSelect: () => void | Promise<void>;
}

export interface MenuToggleItem {
  kind: 'toggle';
  id: string;
  /** Label when the toggle is on. */
  label: string;
  /** Label when the toggle is off (defaults to label). */
  labelOff?: string;
  icon: IconName;
  iconOff?: IconName;
  get: () => boolean;
  set: (value: boolean) => void;
}

export interface MenuHoldItem {
  kind: 'hold';
  id: string;
  label: string;
  icon: IconName;
  /** Milliseconds the control must be held. Kid-proof default: 1200 ms. */
  holdMs?: number;
  doneLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export type MenuItem = MenuLinkItem | MenuButtonItem | MenuToggleItem | MenuHoldItem;

export interface MenuOptions {
  container: HTMLElement;
  items: MenuItem[];
  /** Short title shown at the top of the rail. */
  title?: string;
  ariaLabel?: string;
  /** Called on any item activation (for sounds). */
  onActivate?: (id: string) => void;
}

export interface Menu {
  root: HTMLElement;
  rail: HTMLElement;
  toggleButton: HTMLButtonElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Re-read toggle states and labels. */
  refresh(): void;
  setHidden(id: string, hidden: boolean): void;
  dispose(): void;
}

export interface HoldButtonOptions {
  button: HTMLElement;
  holdMs: number;
  onConfirm: () => void | Promise<void>;
  onStart?: () => void;
  onCancel?: () => void;
  onDone?: () => void;
}

/**
 * Hold-to-confirm behaviour for a button: pointer or Enter/Space must stay down for holdMs.
 * Releasing early cancels. Returns a dispose function.
 */
export function attachHoldToConfirm(o: HoldButtonOptions): () => void {
  const btn = o.button;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  btn.style.setProperty('--g499-hold-ms', `${o.holdMs}ms`);

  const cancel = () => {
    if (!active) return;
    active = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    btn.classList.remove('is-holding');
    o.onCancel?.();
  };

  const complete = () => {
    active = false;
    timer = null;
    btn.classList.remove('is-holding');
    btn.classList.add('is-done');
    void Promise.resolve(o.onConfirm()).finally(() => {
      o.onDone?.();
      setTimeout(() => btn.classList.remove('is-done'), 1600);
    });
  };

  const start = () => {
    if (active) return;
    active = true;
    btn.classList.add('is-holding');
    o.onStart?.();
    timer = setTimeout(complete, o.holdMs);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    start();
  };
  const onPointerEnd = () => cancel();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    e.preventDefault();
    if (e.repeat) return;
    start();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    cancel();
  };
  const onClick = (e: Event) => e.preventDefault();

  btn.addEventListener('pointerdown', onPointerDown);
  btn.addEventListener('pointerup', onPointerEnd);
  btn.addEventListener('pointercancel', onPointerEnd);
  btn.addEventListener('pointerleave', onPointerEnd);
  btn.addEventListener('keydown', onKeyDown);
  btn.addEventListener('keyup', onKeyUp);
  btn.addEventListener('blur', onPointerEnd);
  btn.addEventListener('click', onClick);
  return () => {
    cancel();
    btn.removeEventListener('pointerdown', onPointerDown);
    btn.removeEventListener('pointerup', onPointerEnd);
    btn.removeEventListener('pointercancel', onPointerEnd);
    btn.removeEventListener('pointerleave', onPointerEnd);
    btn.removeEventListener('keydown', onKeyDown);
    btn.removeEventListener('keyup', onKeyUp);
    btn.removeEventListener('blur', onPointerEnd);
    btn.removeEventListener('click', onClick);
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createMenu(options: MenuOptions): Menu {
  const disposers: Array<() => void> = [];
  const root = el('div', 'g499-menu-root');
  const railId = `g499-rail-${Math.floor(Math.random() * 1e6)}`;

  const toggleButton = el('button', 'g499-drawer-toggle', {
    type: 'button',
    'aria-label': 'Open menu',
    'aria-expanded': 'false',
    'aria-controls': railId,
  });
  toggleButton.innerHTML = iconSvg('menu') + '<span class="g499-sr-only">Menu</span>';

  const backdrop = el('div', 'g499-backdrop', { hidden: '' });

  const rail = el('nav', 'g499-rail', {
    id: railId,
    'aria-label': options.ariaLabel ?? 'Menu',
  });

  const header = el('div', 'g499-rail-header');
  const brand = el('div', 'g499-rail-brand');
  brand.innerHTML = iconSvg('games', 'g499-icon-svg g499-brand-svg');
  const title = el('div', 'g499-rail-title');
  title.textContent = options.title ?? 'Games';
  header.append(brand, title);

  const closeBtn = el('button', 'g499-rail-close', { type: 'button', 'aria-label': 'Close menu' });
  closeBtn.innerHTML = iconSvg('close');
  header.append(closeBtn);

  const list = el('ul', 'g499-rail-list');
  rail.append(header, list);
  root.append(toggleButton, backdrop, rail);
  options.container.append(root);

  const nodes = new Map<string, HTMLElement>();
  const refreshers: Array<() => void> = [];

  const buildInner = (icon: IconName, label: string) =>
    `<span class="g499-icon">${iconSvg(icon)}</span><span class="g499-label">${label}</span>`;

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    rail.classList.toggle('is-open', v);
    root.classList.toggle('is-open', v);
    backdrop.hidden = !v;
    toggleButton.setAttribute('aria-expanded', v ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', v ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('g499-drawer-open', v);
    if (v) {
      const first = list.querySelector<HTMLElement>('a, button');
      first?.focus({ preventScroll: true });
    }
  };

  const activate = (id: string) => options.onActivate?.(id);

  for (const item of options.items) {
    const li = el('li', 'g499-rail-item');
    let control: HTMLElement | null = null;
    switch (item.kind) {
      case 'link': {
        const a = el('a', 'g499-menu-item', { href: item.href, 'aria-label': item.label });
        a.innerHTML = buildInner(item.icon, item.label);
        a.addEventListener('click', () => activate(item.id));
        control = a;
        break;
      }
      case 'button': {
        const b = el('button', 'g499-menu-item', { type: 'button', 'aria-label': item.label });
        b.innerHTML = buildInner(item.icon, item.label);
        b.addEventListener('click', () => {
          activate(item.id);
          void item.onSelect();
        });
        control = b;
        break;
      }
      case 'toggle': {
        const b = el('button', 'g499-menu-item g499-menu-toggle', { type: 'button' });
        const render = () => {
          const on = item.get();
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          const label = on ? item.label : (item.labelOff ?? item.label);
          b.setAttribute('aria-label', label);
          b.innerHTML = buildInner(on ? item.icon : (item.iconOff ?? item.icon), label);
          b.classList.toggle('is-on', on);
        };
        b.addEventListener('click', () => {
          item.set(!item.get());
          render();
          activate(item.id);
        });
        refreshers.push(render);
        render();
        control = b;
        break;
      }
      case 'hold': {
        const b = el('button', 'g499-menu-item g499-menu-hold', {
          type: 'button',
          'aria-label': `${item.label} (hold to confirm)`,
        });
        b.innerHTML =
          buildInner(item.icon, item.label) +
          '<span class="g499-hold-fill" aria-hidden="true"></span>' +
          `<span class="g499-hold-done" aria-hidden="true">${iconSvg('check')}<span>${item.doneLabel ?? 'Done'}</span></span>`;
        disposers.push(
          attachHoldToConfirm({
            button: b,
            holdMs: item.holdMs ?? 1200,
            onConfirm: () => {
              activate(item.id);
              return item.onConfirm();
            },
          }),
        );
        control = b;
        break;
      }
    }
    if (!control) continue;
    control.dataset['menuId'] = item.id;
    nodes.set(item.id, li);
    li.append(control);
    list.append(li);
  }

  const onToggleClick = () => setOpen(!open);
  const onBackdrop = () => setOpen(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && open) {
      setOpen(false);
      toggleButton.focus({ preventScroll: true });
    }
  };
  toggleButton.addEventListener('click', onToggleClick);
  closeBtn.addEventListener('click', onBackdrop);
  backdrop.addEventListener('click', onBackdrop);
  window.addEventListener('keydown', onKey);
  // Following a link closes the drawer so a back navigation feels right.
  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('a') && open) setOpen(false);
  });

  return {
    root,
    rail,
    toggleButton,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    refresh: () => refreshers.forEach((r) => r()),
    setHidden(id, hidden) {
      const node = nodes.get(id);
      if (node) node.hidden = hidden;
    },
    dispose() {
      for (const d of disposers) d();
      toggleButton.removeEventListener('click', onToggleClick);
      closeBtn.removeEventListener('click', onBackdrop);
      backdrop.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('g499-drawer-open');
      root.remove();
    },
  };
}
