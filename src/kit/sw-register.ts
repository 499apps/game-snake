/**
 * Service worker registration. Standalone builds register their own sw.js (scope = base).
 * Assembled builds (VITE_ASSEMBLED=1) register the single hub worker at /games/sw.js and
 * unregister any stale game-scoped worker.
 */
import { HUB_BASE, HUB_SW_URL } from './csp';

export interface SwRegisterOptions {
  /** import.meta.env.BASE_URL of the page, e.g. "/games/snake/". */
  base: string;
  /** True when built with VITE_ASSEMBLED=1. */
  assembled: boolean;
  /** Skip registration (dev server has no sw.js). */
  skip?: boolean;
  onUpdateReady?: () => void;
}

export function isAssembledBuild(): boolean {
  const v = (import.meta.env as Record<string, unknown>)['VITE_ASSEMBLED'];
  return v === '1' || v === 1 || v === true;
}

export function swTargets(o: Pick<SwRegisterOptions, 'base' | 'assembled'>): {
  scriptUrl: string;
  scope: string;
} {
  const base = o.base.endsWith('/') ? o.base : `${o.base}/`;
  if (o.assembled) return { scriptUrl: HUB_SW_URL, scope: HUB_BASE };
  return { scriptUrl: `${base}sw.js`, scope: base };
}

export async function registerServiceWorker(
  o: SwRegisterOptions,
): Promise<ServiceWorkerRegistration | null> {
  if (o.skip) return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (typeof location !== 'undefined' && location.protocol === 'file:') return null;
  const { scriptUrl, scope } = swTargets(o);
  try {
    if (o.assembled) {
      const base = o.base.endsWith('/') ? o.base : `${o.base}/`;
      if (base !== HUB_BASE) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (new URL(reg.scope).pathname === base) await reg.unregister();
        }
      }
    }
    const reg = await navigator.serviceWorker.register(scriptUrl, { scope });
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' && navigator.serviceWorker.controller) {
          o.onUpdateReady?.();
        }
      });
    });
    return reg;
  } catch {
    // Registration is best-effort: the page still works online.
    return null;
  }
}
