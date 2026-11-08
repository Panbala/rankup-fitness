// Tiny HTTP helpers: an error type, a JSON body reader, a route table and a static file server.

import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- JSON in / out ---------- */

const MAX_BODY_BYTES = 100 * 1024;

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new HttpError(400, 'Body must be valid JSON.');
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/* ---------- routes ---------- */

// routes is a list of { method, path, auth, handler } objects.
export function createRouteTable(routes) {
  const table = new Map(routes.map((r) => [`${r.method} ${r.path}`, r]));
  return (method, path) => table.get(`${method} ${path}`) ?? null;
}

/* ---------- static files ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

export async function serveStatic(res, publicDir, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const file = resolve(publicDir, '.' + decodeURIComponent(requested));
  // Block "../" tricks: the resolved path must stay inside publicDir.
  if (file !== publicDir && !file.startsWith(publicDir + sep)) throw new HttpError(403, 'Forbidden.');
  let data;
  try {
    data = await readFile(file);
  } catch {
    throw new HttpError(404, 'Not found.');
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(data);
}
