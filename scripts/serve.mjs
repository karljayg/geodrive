// Local static server for public/. Run: npm start
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const LOGS = fileURLToPath(new URL('../logs/', import.meta.url));
const PORT = Number(process.env.PORT) || 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };

// Stands in for public/log.php, which needs the server's PHP.
async function saveLog(req, res) {
  const parts = [];
  for await (const part of req) parts.push(part);
  const body = Buffer.concat(parts), name = `local_${Date.now()}.json`;
  await mkdir(LOGS, { recursive: true });
  await writeFile(LOGS + name, body);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ name, rows: JSON.parse(body).rows.length }));
}

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/log.php') return saveLog(req, res);
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path) || '.html'] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`GeoDrive: http://localhost:${PORT}/`));
