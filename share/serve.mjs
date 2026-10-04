// Serves one shared film to anyone holding its link: a player page, the video
// (with Range, so phones can seek), its poster and fonts. Tailscale Funnel
// mounts it at /<token> on :8443 (share.sh sets that up); anything else is a 404.
// Reads .token, .port and .origin from its own folder.
import { createServer } from 'node:http';
import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(DIR, f), 'utf8').trim();
const TOKEN = read('.token'), PORT = Number(read('.port')), ORIGIN = read('.origin');
const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const FILES = new Set(readdirSync(DIR).filter((f) => !f.startsWith('.') && TYPES[extname(f)]));
const page = readFileSync(join(DIR, 'index.html'), 'utf8').replaceAll('__BASE__', `${ORIGIN}/${TOKEN}`);

createServer((req, res) => {
  // Funnel strips the mount path; accept the full path too so a direct hit works.
  let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path.startsWith(`/${TOKEN}`)) path = path.slice(TOKEN.length + 1) || '/';
  const name = path.replace(/^\/+/, '');
  if (name === '' || name === 'index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
    res.end(req.method === 'HEAD' ? undefined : page);
    return;
  }
  if (!FILES.has(name)) { res.writeHead(404).end('not found'); return; }
  const file = join(DIR, name), size = statSync(file).size;
  const head = { 'Content-Type': TYPES[extname(name)], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (r) {
    const start = r[1] ? +r[1] : Math.max(0, size - +r[2]);
    const end = r[1] && r[2] ? Math.min(+r[2], size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');
