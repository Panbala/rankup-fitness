import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

// A server on a random port, an in-memory database and a clock the tests control.
let now = new Date('2026-11-06T00:30:00Z'); // 06:00 in Asia/Kolkata
const server = createApp({ dbFile: ':memory:', secret: 'test-secret', clock: () => now, rateLimitMax: 1000 });
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const profile = { age: 25, gender: 'male', height: 170, weight: 65, act: 'beginner', goal: 'fit', wake: '06:00', bed: '22:30', water: 2500, tz: 'Asia/Kolkata' };

test('auth: register, duplicate, login, bad password, protected route', async () => {
  const bad = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'nope', password: '123456' } });
  assert.equal(bad.status, 400);

  const reg = await call('POST', '/api/auth/register', { body: { name: 'Pan', email: 'Pan@Example.com', password: 'secret1', tz: 'Asia/Kolkata' } });
  assert.equal(reg.status, 200);
  assert.ok(reg.json.token);
  assert.equal(reg.json.state.onboarded, false);

  const dup = await call('POST', '/api/auth/register', { body: { name: 'Pan', email: 'pan@example.com', password: 'secret1' } });
  assert.equal(dup.status, 409);

  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'pan@example.com', password: 'wrong!!' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'pan@example.com', password: 'secret1' } })).status, 200);

  assert.equal((await call('GET', '/api/me')).status, 401);
  assert.equal((await call('GET', '/api/me', { token: reg.json.token + 'x' })).status, 401);
});

test('full day: onboarding, quests, bonus, persistence', async () => {
  const { json: reg } = await call('POST', '/api/auth/register', { body: { name: 'Quest', email: 'quest@example.com', password: 'secret1', tz: 'Asia/Kolkata' } });
  const token = reg.token;

  // quests are locked until onboarding is done
  assert.equal((await call('POST', '/api/quests/wake', { token })).status, 409);

  const invalid = await call('PUT', '/api/me/profile', { token, body: { ...profile, age: 5 } });
  assert.equal(invalid.status, 400);

  const onboarded = await call('PUT', '/api/me/profile', { token, body: profile });
  assert.equal(onboarded.status, 200);
  assert.equal(onboarded.json.progress.level, 1);
  assert.equal(onboarded.json.progress.rank, 'E');
  assert.equal(onboarded.json.progress.power, 340);

  const wake = await call('POST', '/api/quests/wake', { token });
  assert.equal(wake.json.today.wake, 2);
  assert.equal(wake.json.progress.xp, 20);
  assert.equal((await call('POST', '/api/quests/wake', { token })).status, 409);

  for (const ml of [1000, 1000, 500]) await call('POST', '/api/quests/water', { token, body: { ml } });
  for (const id of ['push', 'squat', 'sit', 'run']) await call('POST', '/api/quests/exercise', { token, body: { id } });
  assert.equal((await call('POST', '/api/quests/exercise', { token, body: { id: 'fly' } })).status, 400);

  // daytime: sleep is not allowed yet
  assert.equal((await call('POST', '/api/quests/sleep', { token })).status, 409);

  now = new Date('2026-11-06T17:00:00Z'); // 22:30 IST
  const sleep = await call('POST', '/api/quests/sleep', { token });
  assert.equal(sleep.status, 200);
  assert.equal(sleep.json.today.questsDone, 4);
  assert.equal(sleep.json.today.bonus, true);
  assert.equal(sleep.json.progress.streak, 1);
  assert.ok(sleep.json.events.some((e) => e.type === 'bonus'));

  const me = await call('GET', '/api/me', { token });
  assert.deepEqual(me.json.today.exercises, { push: true, squat: true, sit: true, run: true });
  assert.equal(me.json.history.length, 7);
  assert.equal(me.json.history.at(-1).today, true);
  assert.equal(me.json.history.at(-1).power, me.json.progress.power);
});

test('next day: skipped quests cost XP and the streak; notice can be dismissed', async () => {
  // continue with the previous test's user, jump to the next quest day, do nothing, jump again
  const { json: login } = await call('POST', '/api/auth/login', { body: { email: 'quest@example.com', password: 'secret1' } });
  const token = login.token;

  now = new Date('2026-11-07T01:00:00Z'); // next day, 06:30 IST
  let me = await call('GET', '/api/me', { token });
  assert.equal(me.json.progress.streak, 1); // yesterday was fully cleared
  assert.equal(me.json.progress.notice, '');

  now = new Date('2026-11-08T01:00:00Z'); // the day after: day 07 was empty
  me = await call('GET', '/api/me', { token });
  assert.equal(me.json.progress.streak, 0);
  assert.match(me.json.progress.notice, /Penalty/);

  me = await call('POST', '/api/me/dismiss-notice', { token });
  assert.equal(me.json.progress.notice, '');
});

test('plan updates are validated; reset wipes progress', async () => {
  const { json: login } = await call('POST', '/api/auth/login', { body: { email: 'quest@example.com', password: 'secret1' } });
  const token = login.token;

  assert.equal((await call('PUT', '/api/me/plan', { token, body: { wake: '25:00' } })).status, 400);
  assert.equal((await call('PUT', '/api/me/plan', { token, body: { water: 99999 } })).status, 400);
  const ok = await call('PUT', '/api/me/plan', { token, body: { wake: '05:30', water: 3000, alarm: false } });
  assert.equal(ok.json.plan.wake, '05:30');
  assert.equal(ok.json.plan.water, 3000);
  assert.equal(ok.json.plan.alarm, false);
  assert.equal(ok.json.plan.remind, true);

  const reset = await call('POST', '/api/me/reset', { token });
  assert.equal(reset.json.progress.level, 1);
  assert.equal(reset.json.progress.xp, 0);
  assert.equal(reset.json.today.questsDone, 0);
});

test('static files and unknown routes', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/..%2Fserver%2Findex.js')).status, 403);
});
