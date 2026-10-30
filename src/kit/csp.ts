/**
 * The one Content-Security-Policy every page carries, plus the PWA head tags.
 * The HTML files hold these literally; tests compare against these constants.
 */

export const CSP_CONTENT =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">`;

export const REFERRER_META = '<meta name="referrer" content="no-referrer">';

export const HUB_BASE = '/games/';
export const HUB_SW_URL = '/games/sw.js';
export const HUB_MANIFEST_URL = '/games/manifest.webmanifest';
export const PRIVACY_URL = '/games/privacy/';

export interface HeadTagOptions {
  title: string;
  description: string;
  themeColor: string;
  /** Game pages lock zoom; the hub and privacy page keep it for accessibility. */
  lockZoom: boolean;
  appTitle: string;
}

/** Reference head block (documentation + tests). Pages hold the same tags literally. */
export function pwaHeadTags(o: HeadTagOptions): string {
  const viewport = o.lockZoom
    ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    : 'width=device-width, initial-scale=1, viewport-fit=cover';
  return [
    '<meta charset="utf-8">',
    CSP_META,
    REFERRER_META,
    `<meta name="viewport" content="${viewport}">`,
    `<title>${o.title}</title>`,
    `<meta name="description" content="${o.description}">`,
    `<meta name="theme-color" content="${o.themeColor}">`,
    '<meta name="color-scheme" content="dark">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    `<meta name="apple-mobile-web-app-title" content="${o.appTitle}">`,
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  ].join('\n');
}
