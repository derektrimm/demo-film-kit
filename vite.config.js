import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The caption track, rendered over the game's capture, is the only page.
export default defineConfig({
  build: { rollupOptions: { input: { overlay: resolve(import.meta.dirname, 'overlay.html') } } },
});
