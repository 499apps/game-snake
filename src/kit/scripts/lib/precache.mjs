// Pure precache logic (unit tested from src/precache.test.ts).
import { SW_TEMPLATE } from './sw-template.mjs';
import { sha256 } from './fsutil.mjs';

export const SW_FILE = 'sw.js';

/** Files that must never ship to the 499apps.com Pages repo. */
const FORBIDDEN_NAMES = new Set(['CNAME', '.nojekyll', '_config.yml', 'Gemfile', '_site']);

/**
 * Check output paths (posix, relative to the dist root). Returns a list of problems.
 * Rule: no path segment may start with "_" or "." (Jekyll ignores those), no CNAME.
 * @param {string[]} relPaths
 */
export function checkOutputNames(relPaths) {
  const problems = [];
  for (const rel of relPaths) {
    const segments = rel.split('/');
    for (const seg of segments) {
      if (seg.startsWith('_') || seg.startsWith('.')) {
        problems.push(`${rel}: segment "${seg}" starts with "_" or "."`);
        break;
      }
      if (FORBIDDEN_NAMES.has(seg)) {
        problems.push(`${rel}: forbidden file "${seg}"`);
        break;
      }
    }
  }
  return problems;
}

/**
 * Check an HTML document for Jekyll front matter and Liquid sequences.
 * @param {string} html
 * @param {string} [label]
 */
export function checkHtmlForLiquid(html, label = 'html') {
  const problems = [];
  // Ignore a leading byte-order mark (U+FEFF) before looking for front matter.
  const body = html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;
  if (/^\s*---/.test(body)) problems.push(`${label}: starts with YAML front matter`);
  if (html.includes('{{')) problems.push(`${label}: contains "{{"`);
  if (html.includes('{%')) problems.push(`${label}: contains "{%"`);
  return problems;
}

/**
 * Check that a page carries the required privacy meta tags.
 * @param {string} html
 * @param {string} [label]
 */
export function checkHtmlMeta(html, label = 'html') {
  const problems = [];
  if (!/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    problems.push(`${label}: missing Content-Security-Policy meta`);
  }
  if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(html)) {
    problems.push(`${label}: missing referrer meta`);
  }
  if (/<script\b(?![^>]*\bsrc=)[^>]*>\s*[^\s<]/i.test(html)) {
    problems.push(`${label}: contains an inline script`);
  }
  if (/https?:\/\/(?!localhost)[^"'\s<)]+/i.test(stripComments(html))) {
    // Absolute http(s) URLs are allowed only in plain text, never as src/href targets.
    const m = /(src|href)=["']https?:\/\/[^"']+["']/i.exec(html);
    if (m) problems.push(`${label}: external resource reference ${m[0]}`);
  }
  return problems;
}

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Build the precache manifest.
 * @param {{ path: string, hash: string }[]} files relative posix paths + content hashes
 * @param {string} base URL prefix, e.g. "/games/snake/"
 */
export function buildPrecacheManifest(files, base) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const entries = files
    .filter((f) => f.path !== SW_FILE)
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const version = sha256(entries.map((e) => `${e.path}\0${e.hash}\n`).join('')).slice(0, 16);
  const assets = entries.map((e) => prefix + e.path);
  return { version, assets, entries };
}

/**
 * Render the service worker source.
 * @param {{ scope: string, version: string, assets: string[] }} o
 */
export function renderServiceWorker(o) {
  if (!o.scope.startsWith('/') || !o.scope.endsWith('/')) {
    throw new Error(`scope must start and end with "/": ${o.scope}`);
  }
  if (!/^[0-9a-f]{8,64}$/.test(o.version)) throw new Error(`bad version: ${o.version}`);
  for (const a of o.assets) {
    if (!a.startsWith(o.scope)) throw new Error(`asset ${a} is outside scope ${o.scope}`);
  }
  return SW_TEMPLATE.replace('__G499_SCOPE__', o.scope)
    .replace('__G499_VERSION__', o.version)
    .replace('__G499_ASSETS__', JSON.stringify(o.assets));
}

/** True when the build runs inside the hub assembly (VITE_ASSEMBLED=1). */
export function isAssembled(env = process.env) {
  return env.VITE_ASSEMBLED === '1';
}
