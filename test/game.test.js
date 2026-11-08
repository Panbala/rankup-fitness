import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../server/game.js';
import { dayKey } from '../server/time.js';

const TZ = 'Asia/Kolkata';
// 06:00 IST on 6 Nov 2026 is 00:30 UTC.
const at = (isoUtc) => new Date(isoUtc);

function makeState(overrides = {}) {
  const progress = game.newProgress('beginner');
  const today = game.newDay('2026-11-06');
  today.power = game.power(progress);
  return {
    profile: { act: 'beginner' },
    plan: { wake: '06:00', bed: '22:30', water: 2500 },
    progress,
    today,
    now: at('2026-11-06T00:30:00Z'),
    tz: TZ,
    ...overrides,
  };
}

test('rank thresholds', () => {
  assert.equal(game.rankOf(1), 'E');
  assert.equal(game.rankOf(5), 'D');
  assert.equal(game.rankOf(10), 'C');
  assert.equal(game.rankOf(20), 'B');
  assert.equal(game.rankOf(35), 'A');
  assert.equal(game.rankOf(50), 'S');
});

test('day key resets at 4 AM local time', () => {
  assert.equal(dayKey(at('2026-11-05T22:30:00Z'), TZ), '2026-11-06'); // 04:00 IST -> new day
  assert.equal(dayKey(at('2026-11-05T22:29:00Z'), TZ), '2026-11-05'); // 03:59 IST -> still yesterday
});

test('on-time wake gives full XP and +1 INT', () => {
  const s = makeState();
  const events = [];
  game.completeWake(s, events);
  assert.equal(s.today.wake, 2);
  assert.equal(s.progress.xp, game.XP.wake);
  assert.equal(s.progress.int, 11);
  assert.throws(() => game.completeWake(s, []), /already logged/);
});

test('late wake gives reduced XP', () => {
  const s = makeState({ now: at('2026-11-06T04:30:00Z') }); // 10:00 IST
  game.completeWake(s, []);
  assert.equal(s.today.wake, 1);
  assert.equal(s.progress.xp, game.XP.wakeLate);
});

test('water completes once and cannot go below zero', () => {
  const s = makeState();
  game.addWater(s, 1000, []);
  game.addWater(s, -5000 + 4000, []); // -1000
  assert.equal(s.today.water, 0);
  game.addWater(s, 1000, []);
  game.addWater(s, 1000, []);
  const events = [];
  game.addWater(s, 500, events);
  assert.equal(s.today.waterDone, true);
  assert.equal(events.filter((e) => e.message === 'Hydration complete').length, 1);
  game.addWater(s, 250, events); // already done, no second reward
  assert.equal(events.filter((e) => e.message === 'Hydration complete').length, 1);
  assert.throws(() => game.addWater(s, 5000, []), /Invalid/);
});

test('clearing all four quests grants the daily bonus and a streak', () => {
  const s = makeState();
  const events = [];
  game.completeWake(s, events);
  game.addWater(s, 1000, events);
  game.addWater(s, 1000, events);
  game.addWater(s, 1000, events);
  for (const id of game.EXERCISE_IDS) game.completeExercise(s, id, events);
  s.now = at('2026-11-06T17:00:00Z'); // 22:30 IST
  game.completeSleep(s, events);
  assert.equal(s.today.bonus, true);
  assert.equal(s.progress.streak, 1);
  assert.equal(s.progress.best, 1);
  assert.ok(events.some((e) => e.type === 'bonus'));
});

test('sleep is blocked in the daytime and counts after midnight', () => {
  const day = makeState({ now: at('2026-11-06T06:30:00Z') }); // 12:00 IST
  assert.throws(() => game.completeSleep(day, []), /6 PM/);

  const late = makeState({ now: at('2026-11-06T19:30:00Z') }); // 01:00 IST next day
  game.completeSleep(late, []);
  assert.equal(late.today.sleep, 1); // late, reduced reward
});

test('level up raises every stat and carries leftover XP', () => {
  const s = makeState();
  s.progress.xp = game.xpNeeded(1) - 5;
  const events = [];
  game.completeWake(s, events);
  assert.equal(s.progress.level, 2);
  assert.equal(s.progress.xp, game.XP.wake - 5);
  assert.deepEqual([s.progress.str, s.progress.agi, s.progress.vit, s.progress.sense], [11, 11, 11, 11]);
  assert.equal(s.progress.int, 12); // +1 from the quest, +1 from the level up
  assert.ok(events.some((e) => e.type === 'levelup' && e.level === 2));
});

test('rollover penalises a skipped day and resets the streak', () => {
  const progress = game.newProgress('beginner');
  progress.xp = 100;
  progress.streak = 4;
  progress.lastDay = '2026-11-05';
  const yesterday = { ...game.newDay('2026-11-05'), wake: 2 }; // only 1 quest
  game.rollover(progress, yesterday, '2026-11-06');
  assert.equal(progress.xp, 60);
  assert.equal(progress.streak, 0);
  assert.match(progress.notice, /Penalty/);
  assert.equal(progress.lastDay, '2026-11-06');
});

test('rollover keeps the streak after a cleared day and ignores same-day calls', () => {
  const progress = game.newProgress('beginner');
  progress.streak = 3;
  progress.lastDay = '2026-11-05';
  game.rollover(progress, { ...game.newDay('2026-11-05'), bonus: true }, '2026-11-06');
  assert.equal(progress.streak, 3);
  assert.equal(progress.notice, '');
  game.rollover(progress, null, '2026-11-06');
  assert.equal(progress.streak, 3);
});

test('training targets grow with level and cap the run distance', () => {
  const l1 = game.targets({ act: 'beginner' }, 1);
  assert.deepEqual(l1.map((t) => t.n), [8, 15, 12, 1]);
  const l11 = game.targets({ act: 'beginner' }, 11);
  assert.deepEqual(l11.map((t) => t.n), [23, 35, 32, 2.5]);
  assert.equal(game.targets({ act: 'active' }, 80).find((t) => t.id === 'run').n, 10);
});

test('recommended water follows weight within limits', () => {
  assert.equal(game.recommendedWaterMl(65), 2300);
  assert.equal(game.recommendedWaterMl(30), 1500);
  assert.equal(game.recommendedWaterMl(200), 4500);
});
