// Entry point. `npm start` runs this file; tests import createApp() instead.
//
//   PORT        (default 3000)
//   DB_FILE     (default ./data/rankup.db)
//   AUTH_SECRET (default: generated once and stored in ./data/secret.key)

import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDb, createRepo } from './db.js';
import { loadSecret, verifyToken } from './auth.js';
import { createService } from './service.js';
import { buildRoutes } from './routes.js';
import { HttpError, readJson, sendJson, serveStatic, createRouteTable } from './http.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(rootDir, 'public');

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

// Allows 20 register/login attempts per IP every 15 minutes.
function createRateLimiter(limit = 20, windowMs = 15 * 60e3) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    recent.push(now);
    hits.set(ip, recent);
  };
}

export function createApp({ dbFile, secret, clock = () => new Date(), rateLimitMax = 20 } = {}) {
  const db = openDb(dbFile);
  const repo = createRepo(db);
  const service = createService(repo);
  const routes = createRouteTable(buildRoutes({ repo, service, secret, rateLimit: createRateLimiter(rateLimitMax) }));

  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname.startsWith('/api/')) {
        const route = routes(req.method, pathname);
        if (!route) throw new HttpError(404, 'Unknown API route.');

        let userId = null;
        if (route.auth) {
          const header = req.headers.authorization ?? '';
          userId = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '', secret);
          if (userId == null) throw new HttpError(401, 'Please log in again.');
        }
        const body = req.method === 'GET' ? {} : await readJson(req);
        const ip = req.socket.remoteAddress ?? 'unknown';
        return sendJson(res, 200, await route.handler({ body, userId, ip, now: clock() }));
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      await serveStatic(res, publicDir, pathname);
    } catch (err) {
      if (err instanceof HttpError || typeof err.status === 'number') {
        if (req.url.startsWith('/api/')) return sendJson(res, err.status, { error: err.message });
        res.writeHead(err.status, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(err.message);
      }
      console.error(err);
      sendJson(res, 500, { error: 'Something went wrong on the server.' });
    }
  });

  server.on('close', () => db.close());
  return server;
}

/* ---------- start when run directly ---------- */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbFile = process.env.DB_FILE ?? resolve(rootDir, 'data', 'rankup.db');
  const secret = loadSecret({ envSecret: process.env.AUTH_SECRET, file: resolve(dirname(dbFile), 'secret.key') });
  const port = Number(process.env.PORT ?? 3000);
  createApp({ dbFile, secret }).listen(port, () => console.log(`Rankup Fitness running at http://localhost:${port}`));
}
