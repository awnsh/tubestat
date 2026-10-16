// Content scripts cannot be ES modules when declared in the manifest, and the
// service worker must not share chunks with the React pages, so each is bundled
// into a standalone IIFE.
import { build } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const entries = {
  background: 'src/background/service-worker.ts',
  'content-bridge': 'src/youtube/page-bridge.ts',
  'content-tracker': 'src/youtube/content.ts',
};

for (const [name, entry] of Object.entries(entries)) {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome120',
      minify: true,
      lib: { entry: resolve(root, entry), name: name.replace(/-/g, '_'), formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
  console.log(`built ${name}.js`);
}
