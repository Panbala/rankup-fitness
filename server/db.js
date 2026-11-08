// SQLite storage using Node's built-in node:sqlite (no native packages to install).
// Every function here is a small, single-purpose query.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      email      TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      pass_hash  TEXT NOT NULL,
      tz         TEXT NOT NULL DEFAULT 'UTC',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Body details (null until onboarding is finished) plus the daily plan.
    CREATE TABLE IF NOT EXISTS profiles (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      age        INTEGER,
      gender     TEXT,
      height     REAL,
      weight     REAL,
      act        TEXT,
      goal       TEXT,
      wake       TEXT NOT NULL DEFAULT '06:00',
      bed        TEXT NOT NULL DEFAULT '22:30',
      water_goal INTEGER NOT NULL DEFAULT 2500,
      alarm      INTEGER NOT NULL DEFAULT 1,
      remind     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS progress (
      user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp       INTEGER NOT NULL,
      level    INTEGER NOT NULL,
      str      INTEGER NOT NULL,
      agi      INTEGER NOT NULL,
      vit      INTEGER NOT NULL,
      int      INTEGER NOT NULL,
      sense    INTEGER NOT NULL,
      streak   INTEGER NOT NULL DEFAULT 0,
      best     INTEGER NOT NULL DEFAULT 0,
      last_day TEXT,
      notice   TEXT NOT NULL DEFAULT ''
    );

    -- One row per user per quest day.
    CREATE TABLE IF NOT EXISTS days (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day        TEXT NOT NULL,
      wake       INTEGER NOT NULL DEFAULT 0,
      water      INTEGER NOT NULL DEFAULT 0,
      water_done INTEGER NOT NULL DEFAULT 0,
      push       INTEGER NOT NULL DEFAULT 0,
      squat      INTEGER NOT NULL DEFAULT 0,
      sit        INTEGER NOT NULL DEFAULT 0,
      run        INTEGER NOT NULL DEFAULT 0,
      sleep      INTEGER NOT NULL DEFAULT 0,
      bonus      INTEGER NOT NULL DEFAULT 0,
      xp         INTEGER NOT NULL DEFAULT 0,
      power      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);
  return db;
}

const bool = (n) => n === 1;

export function createRepo(db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (email, name, pass_hash, tz) VALUES (?, ?, ?, ?)'),
    insertProfile: db.prepare('INSERT INTO profiles (user_id) VALUES (?)'),
    setTz: db.prepare('UPDATE users SET tz = ? WHERE id = ?'),
    profile: db.prepare('SELECT * FROM profiles WHERE user_id = ?'),
    saveProfile: db.prepare(`
      UPDATE profiles SET age=?, gender=?, height=?, weight=?, act=?, goal=?, wake=?, bed=?, water_goal=?, alarm=?, remind=?
      WHERE user_id = ?`),
    progress: db.prepare('SELECT * FROM progress WHERE user_id = ?'),
    upsertProgress: db.prepare(`
      INSERT INTO progress (user_id, xp, level, str, agi, vit, int, sense, streak, best, last_day, notice)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        xp=excluded.xp, level=excluded.level, str=excluded.str, agi=excluded.agi, vit=excluded.vit,
        int=excluded.int, sense=excluded.sense, streak=excluded.streak, best=excluded.best,
        last_day=excluded.last_day, notice=excluded.notice`),
    day: db.prepare('SELECT * FROM days WHERE user_id = ? AND day = ?'),
    upsertDay: db.prepare(`
      INSERT INTO days (user_id, day, wake, water, water_done, push, squat, sit, run, sleep, bonus, xp, power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, day) DO UPDATE SET
        wake=excluded.wake, water=excluded.water, water_done=excluded.water_done, push=excluded.push,
        squat=excluded.squat, sit=excluded.sit, run=excluded.run, sleep=excluded.sleep,
        bonus=excluded.bonus, xp=excluded.xp, power=excluded.power`),
    powerByDay: db.prepare('SELECT day, power FROM days WHERE user_id = ? AND day >= ? AND day <= ?'),
    deleteDays: db.prepare('DELETE FROM days WHERE user_id = ?'),
  };

  return {
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    /* users */
    findUserByEmail: (email) => q.userByEmail.get(email),
    findUserById: (id) => q.userById.get(id),
    createUser({ email, name, passHash, tz }) {
      const { lastInsertRowid } = q.insertUser.run(email, name, passHash, tz);
      q.insertProfile.run(lastInsertRowid);
      return Number(lastInsertRowid);
    },
    setTimezone: (id, tz) => q.setTz.run(tz, id),

    /* profile + plan */
    getProfile(userId) {
      const r = q.profile.get(userId);
      return {
        profile: r.age == null ? null : { age: r.age, gender: r.gender, height: r.height, weight: r.weight, act: r.act, goal: r.goal },
        plan: { wake: r.wake, bed: r.bed, water: r.water_goal, alarm: bool(r.alarm), remind: bool(r.remind) },
      };
    },
    saveProfile(userId, p, plan) {
      q.saveProfile.run(p.age, p.gender, p.height, p.weight, p.act, p.goal, plan.wake, plan.bed, plan.water, plan.alarm ? 1 : 0, plan.remind ? 1 : 0, userId);
    },

    /* progress */
    getProgress(userId) {
      const r = q.progress.get(userId);
      if (!r) return null;
      return { xp: r.xp, level: r.level, str: r.str, agi: r.agi, vit: r.vit, int: r.int, sense: r.sense, streak: r.streak, best: r.best, lastDay: r.last_day, notice: r.notice };
    },
    saveProgress(userId, p) {
      q.upsertProgress.run(userId, p.xp, p.level, p.str, p.agi, p.vit, p.int, p.sense, p.streak, p.best, p.lastDay, p.notice);
    },

    /* days */
    getDay(userId, day) {
      const r = q.day.get(userId, day);
      if (!r) return null;
      return {
        day: r.day, wake: r.wake, water: r.water, waterDone: bool(r.water_done),
        push: bool(r.push), squat: bool(r.squat), sit: bool(r.sit), run: bool(r.run),
        sleep: r.sleep, bonus: bool(r.bonus), xp: r.xp, power: r.power,
      };
    },
    saveDay(userId, d) {
      q.upsertDay.run(userId, d.day, d.wake, d.water, d.waterDone ? 1 : 0, d.push ? 1 : 0, d.squat ? 1 : 0, d.sit ? 1 : 0, d.run ? 1 : 0, d.sleep, d.bonus ? 1 : 0, d.xp, d.power);
    },
    powerHistory(userId, fromDay, toDay) {
      return Object.fromEntries(q.powerByDay.all(userId, fromDay, toDay).map((r) => [r.day, r.power]));
    },
    deleteAllDays: (userId) => q.deleteDays.run(userId),
  };
}
