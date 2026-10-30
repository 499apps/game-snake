export const SW_FILE: string;
export function checkOutputNames(relPaths: string[]): string[];
export function checkHtmlForLiquid(html: string, label?: string): string[];
export function checkHtmlMeta(html: string, label?: string): string[];
export function buildPrecacheManifest(
  files: { path: string; hash: string }[],
  base: string,
): { version: string; assets: string[]; entries: { path: string; hash: string }[] };
export function renderServiceWorker(o: { scope: string; version: string; assets: string[] }): string;
export function isAssembled(env?: Record<string, string | undefined>): boolean;
