// The API surface. Each route is: method, path, whether it needs login, and a handler.
// Handlers get { body, userId, ip, now } and return the JSON to send.

import * as game from './game.js';
import { HttpError } from './http.js';
import { hashPassword, verifyPassword, signToken } from './auth.js';
import { isValidTimezone } from './time.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildRoutes({ repo, service, secret, rateLimit }) {
  const session = (userId) => ({ token: signToken(userId, secret) });

  const cleanTz = (tz) => (typeof tz === 'string' && isValidTimezone(tz) ? tz : 'UTC');

  return [
    /* ---------- auth ---------- */
    {
      method: 'POST',
      path: '/api/auth/register',
      handler({ body, ip, now }) {
        rateLimit(ip);
        const name = String(body.name ?? '').trim().slice(0, 40);
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        if (!name) throw new HttpError(400, 'Enter your player name.');
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
        if (password.length < 6 || password.length > 200) throw new HttpError(400, 'Password needs at least 6 characters.');
        if (repo.findUserByEmail(email)) throw new HttpError(409, 'This email is already registered. Use Login.');

        const id = repo.createUser({ email, name, passHash: hashPassword(password), tz: cleanTz(body.tz) });
        return { ...session(id), state: service.getState(id, now) };
      },
    },
    {
      method: 'POST',
      path: '/api/auth/login',
      handler({ body, ip, now }) {
        rateLimit(ip);
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const user = repo.findUserByEmail(email);
        // Same message for "no such user" and "wrong password" so emails can't be probed.
        if (!user || !verifyPassword(password, user.pass_hash)) throw new HttpError(401, 'Wrong email or password.');
        return { ...session(user.id), state: service.getState(user.id, now) };
      },
    },

    /* ---------- player ---------- */
    { method: 'GET', path: '/api/me', auth: true, handler: ({ userId, now }) => service.getState(userId, now) },
    {
      method: 'PUT',
      path: '/api/me/profile',
      auth: true,
      handler: ({ userId, body, now }) => service.saveProfile(userId, body, cleanTz(body.tz), now),
    },
    { method: 'PUT', path: '/api/me/plan', auth: true, handler: ({ userId, body, now }) => service.savePlan(userId, body, now) },
    { method: 'POST', path: '/api/me/dismiss-notice', auth: true, handler: ({ userId, now }) => service.dismissNotice(userId, now) },
    { method: 'POST', path: '/api/me/reset', auth: true, handler: ({ userId, now }) => service.resetProgress(userId, now) },

    /* ---------- quests ---------- */
    {
      method: 'POST',
      path: '/api/quests/wake',
      auth: true,
      handler: ({ userId, now }) => service.act(userId, now, (s, ev) => game.completeWake(s, ev)),
    },
    {
      method: 'POST',
      path: '/api/quests/water',
      auth: true,
      handler: ({ userId, body, now }) => service.act(userId, now, (s, ev) => game.addWater(s, Number(body.ml), ev)),
    },
    {
      method: 'POST',
      path: '/api/quests/exercise',
      auth: true,
      handler: ({ userId, body, now }) => service.act(userId, now, (s, ev) => game.completeExercise(s, String(body.id), ev)),
    },
    {
      method: 'POST',
      path: '/api/quests/sleep',
      auth: true,
      handler: ({ userId, now }) => service.act(userId, now, (s, ev) => game.completeSleep(s, ev)),
    },
  ];
}
