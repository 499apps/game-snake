/**
 * Vite helpers shared by every repo (imported from vite.config.ts).
 * - Output file names never start with "_" or "." (the 499apps.com Pages repo runs Jekyll).
 * - three.js goes into its own chunk.
 * - Assembled builds point the manifest link at the hub manifest.
 */
import type { BuildOptions, Plugin } from 'vite';

const HUB_MANIFEST = '/games/manifest.webmanifest';

export function safeOutputName(name: string | undefined, fallback = 'chunk'): string {
  const base = (name ?? fallback).replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/^[_.]+/, '').replace(/[^A-Za-z0-9-]+/g, '-');
  return cleaned.length > 0 ? cleaned : fallback;
}

export function kitBuild(): BuildOptions {
  return {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: (chunk) => `assets/${safeOutputName(chunk.name, 'entry')}-[hash].js`,
        chunkFileNames: (chunk) => `assets/${safeOutputName(chunk.name, 'chunk')}-[hash].js`,
        assetFileNames: (asset) => {
          const first = asset.names && asset.names.length > 0 ? asset.names[0] : asset.name;
          return `assets/${safeOutputName(first, 'asset')}-[hash][extname]`;
        },
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  };
}

export interface KitHtmlOptions {
  assembled: boolean;
}

/** Rewrites the manifest link for assembled builds and guards against Liquid sequences. */
export function kitHtmlPlugin(o: KitHtmlOptions): Plugin {
  return {
    name: 'g499-kit-html',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html;
        if (o.assembled) {
          out = out.replace(
            /(<link\b[^>]*rel=["']manifest["'][^>]*href=["'])([^"']*)(["'])/i,
            (_m, pre: string, _href: string, post: string) => `${pre}${HUB_MANIFEST}${post}`,
          );
        }
        if (out.includes('{{') || out.includes('{%')) {
          throw new Error('HTML contains Liquid-like sequences ({{ or {%), which Jekyll would mangle.');
        }
        if (/^\s*---/.test(out)) {
          throw new Error('HTML must not start with YAML front matter (---).');
        }
        return out;
      },
    },
  };
}
