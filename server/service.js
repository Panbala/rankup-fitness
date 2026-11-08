// Application layer: loads a player's data, runs one game action on it, saves it back,
// and shapes the response ("view") the frontend renders. The frontend never has to
// know the rules, it just draws what the server says.

import * as game from './game.js';
import { dayKey, isValidHHMM, weekdayShort } from './time.js';
import { HttpError } from './http.js';

const ACTS = ['beginner', 'some', 'active'];
const GENDERS = ['male', 'female', 'other'];
const GOALS = ['fit', 'lose', 'gain'];

const bad = (message) => new HttpError(400, message);
const inRange = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;

export function createService(repo) {
  /* ---------- load / save ---------- */

  function load(userId, now) {
    const user = repo.findUserById(userId);
    if (!user) throw new HttpError(401, 'Account not found.');
    const { profile, plan } = repo.getProfile(userId);
    const progress = repo.getProgress(userId);
    const state = { user, profile, plan, progress, today: null, now, tz: user.tz };

    if (profile && progress) {
      const key = dayKey(now, user.tz);
      const prev = progress.lastDay && progress.lastDay !== key ? repo.getDay(userId, progress.lastDay) : null;
      game.rollover(progress, prev, key);
      state.today = repo.getDay(userId, key);
      if (!state.today) {
        state.today = game.newDay(key);
        state.today.power = game.power(progress);
      }
    }
    return state;
  }

  function save(state) {
    if (!state.progress || !state.today) return;
    repo.saveProgress(state.user.id, state.progress);
    repo.saveDay(state.user.id, state.today);
  }

  /* ---------- the response shape ---------- */

  function history(state) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const at = new Date(state.now.getTime() - i * 864e5);
      days.push({ day: dayKey(at, state.tz), weekday: weekdayShort(at, state.tz), today: i === 0 });
    }
    const saved = repo.powerHistory(state.user.id, days[0].day, days[6].day);
    saved[state.today.day] = state.today.power;
    let last = null; // days with no row carry the previous power forward
    return days.map((d) => {
      if (saved[d.day] != null) last = saved[d.day];
      return { ...d, power: last };
    });
  }

  function view(state) {
    const { user, profile, plan, progress, today } = state;
    const base = { user: { name: user.name, email: user.email, tz: user.tz }, onboarded: Boolean(profile), profile, plan };
    if (!profile) return base;

    const rank = game.rankOf(progress.level);
    return {
      ...base,
      progress: {
        level: progress.level,
        rank,
        nextRankLevel: game.nextRankLevel(rank),
        xp: progress.xp,
        xpNeeded: game.xpNeeded(progress.level),
        power: game.power(progress),
        streak: progress.streak,
        best: progress.best,
        notice: progress.notice,
        stats: { str: progress.str, agi: progress.agi, vit: progress.vit, int: progress.int, sense: progress.sense },
      },
      today: {
        wake: today.wake,
        water: today.water,
        waterDone: today.waterDone,
        exercises: { push: today.push, squat: today.squat, sit: today.sit, run: today.run },
        sleep: today.sleep,
        bonus: today.bonus,
        questsDone: game.questCount(today),
        canLogSleep: game.canLogSleep(state.now, state.tz),
      },
      targets: game.targets(profile, progress.level),
      history: history(state),
    };
  }

  /* ---------- public operations ---------- */

  const inTransaction = (fn) => repo.transaction(fn);

  return {
    getState(userId, now) {
      return inTransaction(() => {
        const state = load(userId, now);
        save(state); // persists the day rollover
        return view(state);
      });
    },

    // Runs a quest action (wake, water, ...). Returns the new view plus UI events.
    act(userId, now, action) {
      return inTransaction(() => {
        const state = load(userId, now);
        if (!state.profile) throw new HttpError(409, 'Finish your player data first.');
        const events = [];
        action(state, events);
        save(state);
        return { ...view(state), events };
      });
    },

    // First-time onboarding and later edits use the same call.
    saveProfile(userId, input, tz, now) {
      const age = Number(input.age);
      const height = Number(input.height);
      const weight = Number(input.weight);
      if (!inRange(age, 10, 90) || !Number.isInteger(age)) throw bad('Enter an age between 10 and 90.');
      if (!inRange(height, 100, 230)) throw bad('Enter a height between 100 and 230 cm.');
      if (!inRange(weight, 25, 250)) throw bad('Enter a weight between 25 and 250 kg.');
      if (!ACTS.includes(input.act)) throw bad('Pick a fitness level.');
      if (!GENDERS.includes(input.gender)) throw bad('Pick a gender.');
      if (!GOALS.includes(input.goal)) throw bad('Pick a goal.');

      return inTransaction(() => {
        const current = repo.getProfile(userId).plan;
        const plan = readPlan(input, current);
        repo.saveProfile(userId, { age, gender: input.gender, height, weight, act: input.act, goal: input.goal }, plan);
        if (tz) repo.setTimezone(userId, tz);
        if (!repo.getProgress(userId)) repo.saveProgress(userId, game.newProgress(input.act));
        const state = load(userId, now);
        save(state);
        return view(state);
      });
    },

    savePlan(userId, input, now) {
      return inTransaction(() => {
        const plan = readPlan(input, repo.getProfile(userId).plan);
        const { profile } = repo.getProfile(userId);
        if (!profile) throw new HttpError(409, 'Finish your player data first.');
        repo.saveProfile(userId, profile, plan);
        const state = load(userId, now);
        save(state);
        return view(state);
      });
    },

    dismissNotice(userId, now) {
      return this.act(userId, now, (state) => {
        state.progress.notice = '';
      });
    },

    resetProgress(userId, now) {
      return inTransaction(() => {
        const { profile } = repo.getProfile(userId);
        if (!profile) throw new HttpError(409, 'Finish your player data first.');
        repo.deleteAllDays(userId);
        repo.saveProgress(userId, game.newProgress(profile.act));
        const state = load(userId, now);
        save(state);
        return view(state);
      });
    },
  };
}

// Merges any plan fields in `input` over the current plan, validating each one.
function readPlan(input, current) {
  const plan = { ...current };
  if (input.wake !== undefined) {
    if (!isValidHHMM(input.wake)) throw bad('Wake up time must look like 06:30.');
    plan.wake = input.wake;
  }
  if (input.bed !== undefined) {
    if (!isValidHHMM(input.bed)) throw bad('Sleep time must look like 22:30.');
    plan.bed = input.bed;
  }
  if (input.water !== undefined) {
    const water = Number(input.water);
    if (!Number.isInteger(water) || !inRange(water, 500, 8000)) throw bad('Water goal should be 500 to 8000 ml.');
    plan.water = water;
  }
  if (input.alarm !== undefined) plan.alarm = Boolean(input.alarm);
  if (input.remind !== undefined) plan.remind = Boolean(input.remind);
  return plan;
}
