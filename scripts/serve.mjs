// A plain static server for rendering: the built pages in dist/ first, then the project itself
// (captures, backdrops and other files a page loads by path). Nothing hot-reloads mid-render.
//   const { url, close } = await serve();      url ends in '/'
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
};

export async function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    for (const base of ['dist', '']) {
      try {
        const body = await readFile(join(ROOT, base, path.endsWith('/') ? `${path}index.html` : path));
        res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? (path.endsWith('/') ? 'text/html' : 'application/octet-stream') });
        res.end(body);
        return;
      } catch { /* try the next base */ }
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}
