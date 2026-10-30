/**
 * Fullscreen helpers. Hidden on platforms without the API (iPhone Safari).
 */

interface FsDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FsDocument;
  const el = document.documentElement as FsElement;
  const enabled = doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
  const hasRequest =
    typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  return enabled && hasRequest;
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FsDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function toggleFullscreen(target?: HTMLElement): Promise<boolean> {
  if (!fullscreenSupported()) return false;
  const doc = document as FsDocument;
  const el = (target ?? document.documentElement) as FsElement;
  try {
    if (isFullscreen()) {
      if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      return false;
    }
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
    return isFullscreen();
  } catch {
    return isFullscreen();
  }
}

export function onFullscreenChange(cb: (active: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = () => cb(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
