import { defineConfig } from 'vite';
import { kitBuild, kitHtmlPlugin } from './src/kit/vite-kit';

// VITE_ASSEMBLED=1 (set by the hub's `pnpm assemble`) points the page at the hub manifest and
// the single /games/ service worker; gen-precache then skips this game's own sw.js.
const assembled = process.env['VITE_ASSEMBLED'] === '1';

export default defineConfig({
  base: '/games/snake/',
  plugins: [kitHtmlPlugin({ assembled })],
  build: {
    ...kitBuild(),
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: { port: 5174 },
  preview: { port: 4174, strictPort: true },
});
