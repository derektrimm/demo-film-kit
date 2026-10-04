import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Every page the kit renders: the caption track, the studio, the interface shots and the logo ident.
const page = (path) => resolve(import.meta.dirname, path);
export default defineConfig({
  // three.js is one large chunk by design; the pages are rendered locally, never downloaded.
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { overlay: page('overlay.html'), studio: page('studio/index.html'), ui: page('ui/index.html'), ident: page('ident/index.html') },
    },
  },
});
