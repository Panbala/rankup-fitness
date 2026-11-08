// Pure game rules. No database, no HTTP, no clock: everything receives its inputs,
// which makes this file easy to read and easy to unit test.
//
// A "state" object looks like:
//   { profile, plan, progress, today, now: Date, tz }
// Actions mutate it and push UI events ({ type: 'xp' | 'bonus' | 'levelup', ... }) into `events`.

import { toMinutes, nowMinutes, localHour } from './time.js';

export class GameError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

/* ---------- constants ---------- */

export const XP = { wake: 20, wakeLate: 8, water: 30, exercise: 15, sleep: 25, sleepLate: 8, dailyBonus: 50 };
export const PENALTY_XP = 40;
export const EXERCISE_IDS = ['push', 'squat', 'sit', 'run'];

const RANK_STEPS = [
  [50, 'S'],
  [35, 'A'],
  [20, 'B'],
  [10, 'C'],
  [5, 'D'],
  [0, 'E'],
];
const NEXT_RANK_LEVEL = { E: 5, D: 10, C: 20, B: 35, A: 50, S: null };

const BASE_TARGETS = {
  beginner: { push: 8, squat: 15, sit: 12, run: 1 },
  some: { push: 15, squat: 25, sit: 20, run: 2 },
  active: { push: 25, squat: 40, sit: 30, run: 3 },
};
const START_STAT_BONUS = { beginner: 0, some: 3, active: 6 };

/* ---------- derived values ---------- */

export const xpNeeded = (level) => 150 + (level - 1) * 60;

export function rankOf(level) {
  return RANK_STEPS.find(([min]) => level >= min)[1];
}

export const nextRankLevel = (rank) => NEXT_RANK_LEVEL[rank];

export function power(progress) {
  const { level, str, agi, vit, int, sense } = progress;
  return Math.round(level * 40 + (str + agi + vit + int + sense) * 6);
}

export function questCount(day) {
  const trainingDone = EXERCISE_IDS.every((id) => day[id]);
  return (day.wake > 0 ? 1 : 0) + (day.waterDone ? 1 : 0) + (trainingDone ? 1 : 0) + (day.sleep > 0 ? 1 : 0);
}

// Today's training targets grow with level.
export function targets(profile, level) {
  const b = BASE_TARGETS[profile.act];
  return [
    { id: 'push', name: 'Push-ups', n: b.push + Math.floor((level - 1) * 1.5), unit: 'reps', stat: 'str' },
    { id: 'squat', name: 'Squats', n: b.squat + Math.floor((level - 1) * 2), unit: 'reps', stat: 'agi' },
    { id: 'sit', name: 'Sit-ups', n: b.sit + Math.floor((level - 1) * 2), unit: 'reps', stat: 'vit' },
    { id: 'run', name: 'Run or brisk walk', n: Math.min(10, +(b.run + (level - 1) * 0.15).toFixed(1)), unit: 'km', stat: 'agi' },
  ];
}

export function recommendedWaterMl(weightKg) {
  return Math.max(1500, Math.min(4500, Math.round((weightKg * 35) / 50) * 50));
}

/* ---------- creating state ---------- */

export function newProgress(act) {
  const s = 10 + START_STAT_BONUS[act];
  return { xp: 0, level: 1, str: s, agi: s, vit: s, int: s, sense: s, streak: 0, best: 0, lastDay: null, notice: '' };
}

export function newDay(day) {
  return { day, wake: 0, water: 0, waterDone: false, push: false, squat: false, sit: false, run: false, sleep: 0, bonus: false, xp: 0, power: 0 };
}

/* ---------- day rollover ---------- */

// Called when the quest day changes. Skipping the daily clear breaks the streak,
// and finishing fewer than 2 quests also costs XP.
export function rollover(progress, prevDay, newDayKey) {
  if (progress.lastDay === newDayKey) return;
  if (progress.lastDay) {
    if (!prevDay || !prevDay.bonus) {
      progress.streak = 0;
      if (!prevDay || questCount(prevDay) < 2) {
        progress.xp = Math.max(0, progress.xp - PENALTY_XP);
        progress.notice = `Penalty: you finished fewer than 2 quests yesterday. -${PENALTY_XP} XP and your streak was reset.`;
      }
    }
  }
  progress.lastDay = newDayKey;
}

/* ---------- XP + level ups ---------- */

function addXp(state, amount, events) {
  const { progress, today } = state;
  today.xp += amount;
  progress.xp += amount;
  while (progress.xp >= xpNeeded(progress.level)) {
    progress.xp -= xpNeeded(progress.level);
    progress.level += 1;
    for (const k of ['str', 'agi', 'vit', 'int', 'sense']) progress[k] += 1;
    events.push({ type: 'levelup', level: progress.level, rank: rankOf(progress.level) });
  }
  today.power = power(progress);
}

// Grants XP and +1 to a stat, then checks the "all 4 quests" daily bonus.
function award(state, xp, stat, message, events) {
  const { progress, today } = state;
  if (stat) progress[stat] += 1;
  addXp(state, xp, events);
  events.push({ type: 'xp', xp, message });
  if (!today.bonus && questCount(today) === 4) {
    today.bonus = true;
    progress.streak += 1;
    progress.best = Math.max(progress.best, progress.streak);
    addXp(state, XP.dailyBonus, events);
    events.push({ type: 'bonus', xp: XP.dailyBonus, message: 'Daily clear!' });
  }
}

/* ---------- quest actions ---------- */

export function completeWake(state, events) {
  const { today, plan, now, tz } = state;
  if (today.wake) throw new GameError('Wake up quest already logged today.');
  const diff = nowMinutes(now, tz) - toMinutes(plan.wake);
  const onTime = diff >= -60 && diff <= 30;
  today.wake = onTime ? 2 : 1;
  award(state, onTime ? XP.wake : XP.wakeLate, 'int', onTime ? 'On-time wake up' : 'Late wake up', events);
}

export function addWater(state, ml, events) {
  const { today, plan } = state;
  if (!Number.isInteger(ml) || ml < -1000 || ml > 1000 || ml === 0) throw new GameError('Invalid water amount.', 400);
  today.water = Math.max(0, today.water + ml);
  if (!today.waterDone && today.water >= plan.water) {
    today.waterDone = true;
    award(state, XP.water, 'vit', 'Hydration complete', events);
  }
}

export function completeExercise(state, id, events) {
  const { today, profile, progress } = state;
  if (!EXERCISE_IDS.includes(id)) throw new GameError('Unknown exercise.', 400);
  if (today[id]) throw new GameError('Already done today.');
  today[id] = true;
  const t = targets(profile, progress.level).find((x) => x.id === id);
  award(state, XP.exercise, t.stat, `${t.name} done`, events);
}

// Sleep can only be logged from 6 PM until 4 AM (the day reset).
export function canLogSleep(now, tz) {
  const h = localHour(now, tz);
  return h >= 18 || h < 4;
}

export function completeSleep(state, events) {
  const { today, plan, now, tz } = state;
  if (today.sleep) throw new GameError('Sleep quest already logged today.');
  if (!canLogSleep(now, tz)) throw new GameError('Sleep can be logged from 6 PM onward.');
  let nowM = nowMinutes(now, tz);
  let bedM = toMinutes(plan.bed);
  if (nowM < 240) nowM += 1440; // after midnight still counts as "tonight"
  if (bedM < 240) bedM += 1440;
  const diff = nowM - bedM;
  const onTime = diff >= -120 && diff <= 45;
  today.sleep = onTime ? 2 : 1;
  award(state, onTime ? XP.sleep : XP.sleepLate, 'sense', onTime ? 'Slept on schedule' : 'Late sleep', events);
}
