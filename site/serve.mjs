// Vista previa local del sitio público: sirve la raíz del repo y resuelve URLs sin ".html"
// igual que el .htaccess de Hostinger.  Uso: node site/serve.mjs [puerto]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8794);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const isFile = p => stat(p).then(s => s.isFile()).catch(() => false);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..') || /^(server|site|android|supabase|\.git)([/\\]|$)/.test(path)) { res.writeHead(404).end(); return; }
  const base = join(ROOT, path);
  for (const candidate of [base, base + '.html', join(base, 'index.html')]) {
    if (await isFile(candidate)) {
      res.writeHead(200, { 'content-type': TYPES[extname(candidate)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(candidate));
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
}).listen(PORT, () => console.log(`Sitio en http://localhost:${PORT}/`));
