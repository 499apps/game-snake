import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildPrecacheManifest,
  checkHtmlForLiquid,
  checkHtmlMeta,
  checkOutputNames,
  isAssembled,
  renderServiceWorker,
} from './scripts/lib/precache.mjs';
import { CSP_META, REFERRER_META } from './csp';

describe('checkOutputNames', () => {
  it('rejects segments starting with _ or . and forbidden files', () => {
    expect(checkOutputNames(['index.html', 'assets/main-abc.js'])).toEqual([]);
    expect(checkOutputNames(['_app/x.js']).length).toBe(1);
    expect(checkOutputNames(['assets/.hidden']).length).toBe(1);
    expect(checkOutputNames(['CNAME']).length).toBe(1);
    expect(checkOutputNames(['.nojekyll']).length).toBe(1);
  });

  it('reports at most one problem per path', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 })), (segments) => {
        const rel = segments.join('/');
        expect(checkOutputNames([rel]).length).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('checkHtmlForLiquid', () => {
  it('flags front matter and Liquid sequences', () => {
    expect(checkHtmlForLiquid('<!doctype html><html></html>')).toEqual([]);
    expect(checkHtmlForLiquid('---\ntitle: x\n---\n<html>').length).toBe(1);
    expect(checkHtmlForLiquid('<p>{{ x }}</p>').length).toBe(1);
    expect(checkHtmlForLiquid('<p>{% if %}</p>').length).toBe(1);
  });
});

describe('checkHtmlMeta', () => {
  const good = `<!doctype html><html><head>${CSP_META}${REFERRER_META}<script type="module" src="/a.js"></script></head></html>`;
  it('accepts a page with CSP, referrer meta and external scripts only', () => {
    expect(checkHtmlMeta(good)).toEqual([]);
  });
  it('rejects missing CSP or referrer meta, inline scripts and external resources', () => {
    expect(checkHtmlMeta(`<html><head>${REFERRER_META}</head></html>`).length).toBe(1);
    expect(checkHtmlMeta(`<html><head>${CSP_META}</head></html>`).length).toBe(1);
    expect(checkHtmlMeta(`${good.replace('</head>', '<script>alert(1)</script></head>')}`).length).toBe(1);
    expect(
      checkHtmlMeta(`${good.replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>')}`).length,
    ).toBe(1);
  });
});

describe('buildPrecacheManifest + renderServiceWorker', () => {
  it('excludes sw.js, prefixes the base and hashes content deterministically', () => {
    const files = [
      { path: 'sw.js', hash: 'zzz' },
      { path: 'index.html', hash: 'aaa' },
      { path: 'assets/main-1.js', hash: 'bbb' },
    ];
    const a = buildPrecacheManifest(files, '/games/snake/');
    const b = buildPrecacheManifest(files.slice().reverse(), '/games/snake');
    expect(a.assets).toEqual(['/games/snake/assets/main-1.js', '/games/snake/index.html']);
    expect(a.version).toBe(b.version);
    expect(a.version).toMatch(/^[0-9a-f]{16}$/);
    const changed = buildPrecacheManifest([...files.slice(0, 2), { path: 'assets/main-1.js', hash: 'ccc' }], '/games/snake/');
    expect(changed.version).not.toBe(a.version);
  });

  it('version changes when any file content changes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ path: fc.stringMatching(/^[a-z]{1,8}\.js$/), hash: fc.hexaString({ minLength: 4, maxLength: 8 }) }), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.hexaString({ minLength: 4, maxLength: 8 }),
        (files, newHash) => {
          const uniq = Array.from(new Map(files.map((f) => [f.path, f])).values());
          fc.pre(uniq.length > 0 && uniq[0]?.hash !== newHash);
          const before = buildPrecacheManifest(uniq, '/x/');
          const after = buildPrecacheManifest(
            uniq.map((f, i) => (i === 0 ? { ...f, hash: newHash } : f)),
            '/x/',
          );
          expect(after.version).not.toBe(before.version);
          expect(after.assets).toEqual(before.assets);
        },
      ),
    );
  });

  it('renders a worker with the scope, version and asset list embedded', () => {
    const sw = renderServiceWorker({ scope: '/games/', version: 'abcdef0123456789', assets: ['/games/index.html'] });
    expect(sw).toContain("const SCOPE = '/games/'");
    expect(sw).toContain("const VERSION = 'abcdef0123456789'");
    expect(sw).toContain('["/games/index.html"]');
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).not.toContain('__G499_');
    expect(sw).not.toContain('importScripts');
  });

  it('refuses bad scopes, versions and out-of-scope assets', () => {
    expect(() => renderServiceWorker({ scope: 'games/', version: 'abcdef0123456789', assets: [] })).toThrow();
    expect(() => renderServiceWorker({ scope: '/games/', version: 'nope', assets: [] })).toThrow();
    expect(() =>
      renderServiceWorker({ scope: '/games/snake/', version: 'abcdef0123456789', assets: ['/games/index.html'] }),
    ).toThrow();
  });

  it('isAssembled reads VITE_ASSEMBLED=1', () => {
    expect(isAssembled({})).toBe(false);
    expect(isAssembled({ VITE_ASSEMBLED: '1' })).toBe(true);
    expect(isAssembled({ VITE_ASSEMBLED: 'true' })).toBe(false);
  });
});
