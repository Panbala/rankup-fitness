// Views: each function takes data and returns an HTML string. No state lives here.
// Buttons use data-act="..." and app.js handles the clicks.

import { esc, fmt12, recommendedWater } from './format.js';

const RANK_COLOR = { E: '#8ea0c4', D: '#3ddc97', C: '#3fa9ff', B: '#7b5cff', A: '#ffb84a', S: '#ff5d6c' };

const ICON = {
  status: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  quests: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 4L3 6M19 4l2 2"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
};

const topBar = () => '<div class="top"><span class="brand-name">Rankup</span><span id="clk"></span></div>';

export function nav(tab) {
  const items = [['status', 'Status'], ['quests', 'Quests'], ['plan', 'Plan'], ['profile', 'Profile']];
  const buttons = items
    .map(([id, label]) => `<button data-act="tab" data-v="${id}"${tab === id ? ' aria-current="page"' : ''}>${ICON[id]}${label}</button>`)
    .join('');
  return `<nav><div>${buttons}</div></nav>`;
}

/* ---------- login / register ---------- */

export function authView({ mode, error }) {
  const reg = mode === 'register';
  return `<div class="wrap">
    <div class="hero">
      <p class="tag">[ System ]</p>
      <h1>Rankup Fitness</h1>
      <p>Wake up on time, drink water, train, sleep on schedule. Clear your daily quests and your power grows every day.</p>
    </div>
    <div class="win">
      <span class="tag">[ Preview ]</span>
      <div class="row between">
        <div class="who"><div class="rank" style="--rc:${RANK_COLOR.E}">E</div>
          <div><p class="power-l">Level 1</p><p class="num" style="font-size:22px;font-weight:700">Day 1 power</p></div></div>
        <p class="power" style="font-size:44px">340</p>
      </div>
      <p class="muted small">Every cleared quest raises your XP and stats. Reach Level 5 to become Rank D.</p>
    </div>
    <div class="win">
      <div class="seg">
        <button data-act="mode" data-v="login" aria-pressed="${!reg}">Login</button>
        <button data-act="mode" data-v="register" aria-pressed="${reg}">Register</button>
      </div>
      <form id="authForm" autocomplete="on" novalidate>
        ${reg ? '<div class="field"><label for="a-name">Player name</label><input id="a-name" autocomplete="name" placeholder="Your name"></div>' : ''}
        <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <div class="field"><label for="a-pass">Password</label><input id="a-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="At least 6 characters"></div>
        <p class="err" id="a-err" role="alert">${esc(error)}</p>
        <button class="btn primary" type="submit">${reg ? 'Create account' : 'Login'}</button>
      </form>
    </div>
  </div>`;
}

/* ---------- onboarding / edit data ---------- */

function select(id, options, value) {
  const items = options.map(([v, label]) => `<option value="${v}"${v === value ? ' selected' : ''}>${label}</option>`).join('');
  return `<select id="${id}">${items}</select>`;
}

export function onboardView(s) {
  const first = !s.onboarded;
  const p = s.profile || {};
  const plan = s.plan;
  return `<div class="wrap">
    <div class="hero">
      <p class="tag">[ ${first ? 'Awakening' : 'Edit data'} ]</p>
      <h1>${first ? 'Player data entry' : 'Update your data'}</h1>
      <p>${first ? 'Enter your details once. The system uses them to set your starting quests, water goal and schedule.' : 'Changes apply from now on. Your level and XP stay as they are.'}</p>
    </div>
    <div class="win">
      <span class="tag">[ Body ]</span>
      <form id="obForm" novalidate>
        <div class="grid2">
          <div class="field"><label for="o-age">Age</label><input id="o-age" type="number" inputmode="numeric" value="${p.age ?? ''}" placeholder="25"></div>
          <div class="field"><label for="o-gender">Gender</label>${select('o-gender', [['male', 'Male'], ['female', 'Female'], ['other', 'Other']], p.gender || 'male')}</div>
        </div>
        <div class="grid2">
          <div class="field"><label for="o-height">Height (cm)</label><input id="o-height" type="number" inputmode="decimal" value="${p.height ?? ''}" placeholder="170"></div>
          <div class="field"><label for="o-weight">Weight (kg)</label><input id="o-weight" type="number" inputmode="decimal" value="${p.weight ?? ''}" placeholder="65"></div>
        </div>
        <div class="field"><label for="o-act">Current fitness level</label>${select('o-act', [['beginner', 'Beginner: little or no exercise'], ['some', 'Intermediate: exercise 2-3 days a week'], ['active', 'Advanced: exercise most days']], p.act || 'beginner')}</div>
        <div class="field"><label for="o-goal">Goal</label>${select('o-goal', [['fit', 'Get fitter and stronger'], ['lose', 'Lose weight'], ['gain', 'Gain muscle']], p.goal || 'fit')}</div>
        <span class="tag">[ Daily schedule ]</span>
        <div class="grid2">
          <div class="field"><label for="o-wake">Wake up</label><input id="o-wake" type="time" value="${plan.wake}"></div>
          <div class="field"><label for="o-bed">Sleep at</label><input id="o-bed" type="time" value="${plan.bed}"></div>
        </div>
        <div class="field"><label for="o-water">Daily water goal (ml)</label><input id="o-water" type="number" inputmode="numeric" step="50" value="${plan.water}"><span class="hint">Filled from your weight. You can change it.</span></div>
        <p class="err" id="o-err" role="alert"></p>
        <button class="btn primary" type="submit">${first ? 'Start my journey' : 'Save changes'}</button>
        ${first ? '' : '<button class="btn ghost" type="button" data-act="canceledit">Cancel</button>'}
      </form>
    </div>
  </div>`;
}

// Fills the water goal from the weight field until the person edits the goal by hand.
export function wireOnboardForm() {
  const weight = document.querySelector('#o-weight');
  const water = document.querySelector('#o-water');
  if (!weight || !water) return;
  weight.addEventListener('input', () => {
    const kg = Number(weight.value);
    if (!water.dataset.touched && kg > 0) water.value = recommendedWater(kg);
  });
  water.addEventListener('input', () => (water.dataset.touched = '1'));
}

/* ---------- status tab ---------- */

function powerChart(history) {
  const values = history.filter((h) => h.power != null).map((h) => h.power);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return history
    .map((h) => {
      const empty = h.power == null;
      const height = empty ? 3 : Math.round(25 + ((h.power - min) / (max - min || 1)) * 75) * 0.7;
      return `<div class="col${h.today ? ' today' : ''}"><em>${empty ? '' : h.power}</em><i class="${empty ? 'empty' : ''}" style="height:${height}%"></i><small>${h.weekday}</small></div>`;
    })
    .join('');
}

export function statusView(s) {
  const p = s.progress;
  const t = s.today;
  const stats = p.stats;
  const scale = Math.max(30, ...Object.values(stats)) * 1.15;
  const statRows = [['STR', 'str'], ['AGI', 'agi'], ['VIT', 'vit'], ['INT', 'int'], ['SENSE', 'sense']]
    .map(([label, key]) => `<div class="stat"><b>${label}</b><div class="bar"><i style="width:${Math.round((stats[key] / scale) * 100)}%"></i></div><span>${stats[key]}</span></div>`)
    .join('');
  const nextRank = p.nextRankLevel ? ` · Rank ${rankAt(p.nextRankLevel)} at level ${p.nextRankLevel}` : ' · Max rank';
  const xpPct = Math.round((p.xp / p.xpNeeded) * 100);

  return `${topBar()}
  ${p.notice ? `<div class="win notice"><span class="tag" style="color:var(--bad)">[ Penalty ]</span><p>${esc(p.notice)}</p><button class="btn sm ghost" data-act="dismiss">Understood</button></div>` : ''}
  <div class="win">
    <span class="tag">[ Status ]</span>
    <div class="row between"><div class="who">
      <div class="rank" style="--rc:${RANK_COLOR[p.rank]}">${p.rank}</div>
      <div><h2>${esc(s.user.name)}</h2><p class="muted small">Level ${p.level}${nextRank}</p></div>
    </div></div>
    <div><p class="power-l">Power</p><p class="power">${p.power.toLocaleString('en-US')}</p></div>
    <div>
      <div class="row between small"><span class="muted">XP</span><span class="num">${p.xp} / ${p.xpNeeded}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${xpPct}%"></i></div>
    </div>
    <div class="row between">
      <span class="pill${t.questsDone === 4 ? ' ok' : ''}">Today ${t.questsDone}/4 quests</span>
      <span class="pill${p.streak > 0 ? ' warn' : ''}">Streak ${p.streak} day${p.streak === 1 ? '' : 's'}</span>
      <span class="pill">Best ${p.best}</span>
    </div>
  </div>
  <div class="win"><span class="tag">[ Attributes ]</span><div class="stats">${statRows}</div></div>
  <div class="win"><span class="tag">[ Power, last 7 days ]</span><div class="chart">${powerChart(s.history)}</div></div>`;
}

// Same thresholds as the server, only used for the "Rank X at level N" label.
function rankAt(level) {
  return level >= 50 ? 'S' : level >= 35 ? 'A' : level >= 20 ? 'B' : level >= 10 ? 'C' : level >= 5 ? 'D' : 'E';
}

/* ---------- quests tab ---------- */

export function questsView(s) {
  const t = s.today;
  const plan = s.plan;
  const waterPct = Math.min(100, Math.round((t.water / plan.water) * 100));

  const wake = `<div class="win">
    <div class="q-head"><h3>Wake up on time</h3><span class="q-xp">+20 XP</span></div>
    <p class="muted small">Target ${fmt12(plan.wake)}. Tap within 30 minutes after it (or up to 1 hour before).</p>
    ${t.wake ? `<p class="done-line">${t.wake === 2 ? 'Cleared. On time.' : 'Logged late. Half reward.'}</p>` : '<button class="btn primary" data-act="wake">I am awake</button>'}
  </div>`;

  const water = `<div class="win">
    <div class="q-head"><h3>Drink water</h3><span class="q-xp">+30 XP</span></div>
    <div class="row between small"><span class="num" style="font-size:20px;font-weight:700">${t.water} ml</span><span class="muted">goal ${plan.water} ml</span></div>
    <div class="bar"><i style="width:${waterPct}%"></i></div>
    ${t.waterDone ? '<p class="done-line">Cleared. Well hydrated.</p>' : ''}
    <div class="glasses">
      <button class="btn sm" data-act="water" data-v="250">+250 ml</button>
      <button class="btn sm" data-act="water" data-v="500">+500 ml</button>
      <button class="btn sm ghost" data-act="water" data-v="-250">-250</button>
    </div>
  </div>`;

  const exerciseRows = s.targets
    .map((x) => {
      const done = t.exercises[x.id];
      return `<div class="ex${done ? ' is-done' : ''}">
        <div><span class="n">${x.n}</span> <span class="u">${x.unit} · ${x.name}</span></div>
        ${done ? '<span class="done-line">Done</span>' : `<button class="btn sm" data-act="ex" data-v="${x.id}">Done</button>`}
      </div>`;
    })
    .join('');
  const training = `<div class="win">
    <div class="q-head"><h3>Daily training</h3><span class="q-xp">+15 XP each</span></div>
    <p class="muted small">Targets grow with your level. Do the real reps first, then tap Done.</p>
    ${exerciseRows}
  </div>`;

  const sleep = `<div class="win">
    <div class="q-head"><h3>Sleep on schedule</h3><span class="q-xp">+25 XP</span></div>
    <p class="muted small">Target ${fmt12(plan.bed)}. Tap when you go to bed, from 6 PM onward.</p>
    ${t.sleep
      ? `<p class="done-line">${t.sleep === 2 ? 'Cleared. On schedule.' : 'Logged late. Reduced reward.'}</p>`
      : `<button class="btn primary" data-act="sleep"${t.canLogSleep ? '' : ' disabled'}>Going to sleep</button>${t.canLogSleep ? '' : '<p class="hint">Available from 6 PM.</p>'}`}
  </div>`;

  return `${topBar()}
  <div class="win">
    <span class="tag">[ Daily quests ]</span>
    <div class="row between"><p class="num" style="font-size:22px;font-weight:700">${t.questsDone} of 4 cleared</p>
      <span class="pill${t.bonus ? ' ok' : ''}">${t.bonus ? '+50 bonus earned' : '+50 bonus at 4/4'}</span></div>
    <p class="muted small">Quests reset at 4 AM. Missing 3 or more quests in a day costs 40 XP and your streak.</p>
  </div>
  ${wake}${water}${training}${sleep}`;
}

/* ---------- plan tab ---------- */

export function planView(s) {
  const plan = s.plan;
  return `${topBar()}
  <div class="win">
    <span class="tag">[ Schedule ]</span>
    <div class="grid2">
      <div class="field"><label for="p-wake">Wake up</label><input id="p-wake" type="time" data-set="wake" value="${plan.wake}"></div>
      <div class="field"><label for="p-bed">Sleep at</label><input id="p-bed" type="time" data-set="bed" value="${plan.bed}"></div>
    </div>
    <div class="field"><label for="p-water">Water goal (ml)</label><input id="p-water" type="number" inputmode="numeric" step="50" data-set="water" value="${plan.water}"></div>
  </div>
  <div class="win">
    <span class="tag">[ Alerts ]</span>
    <label class="switch" for="p-alarm"><span>Morning alarm<br><span class="muted small">Rings at ${fmt12(plan.wake)} while this page is open</span></span><input id="p-alarm" type="checkbox" data-set="alarm"${plan.alarm ? ' checked' : ''}></label>
    <label class="switch" for="p-rem"><span>Water and bedtime reminders<br><span class="muted small">Water every 90 minutes, bedtime 30 minutes before</span></span><input id="p-rem" type="checkbox" data-set="remind"${plan.remind ? ' checked' : ''}></label>
    <button class="btn" data-act="testalarm">Test alarm sound</button>
    <p class="hint">A web page cannot wake your phone when it is closed. Keep this page open, or also set a normal phone alarm for the same time.</p>
  </div>
  <div class="win">
    <span class="tag">[ Today's timeline ]</span>
    <dl><dt>${fmt12(plan.wake)}</dt><dd>Wake up</dd><dt>Through the day</dt><dd>${plan.water} ml water</dd><dt>Any time</dt><dd>4 training sets</dd><dt>${fmt12(plan.bed)}</dt><dd>Sleep</dd></dl>
  </div>`;
}

/* ---------- profile tab ---------- */

export function profileView(s, { confirmReset }) {
  const p = s.profile;
  const level = { beginner: 'Beginner', some: 'Intermediate', active: 'Advanced' }[p.act];
  const goal = { fit: 'Fitter and stronger', lose: 'Lose weight', gain: 'Gain muscle' }[p.goal];
  const resetBlock = confirmReset
    ? '<p class="err">This deletes your level, XP and history.</p><div class="grid2"><button class="btn danger" data-act="reset2">Yes, reset</button><button class="btn ghost" data-act="reset0">Cancel</button></div>'
    : '<button class="btn danger" data-act="reset1">Reset progress</button>';

  return `${topBar()}
  <div class="win">
    <span class="tag">[ Player ]</span>
    <dl>
      <dt>Name</dt><dd>${esc(s.user.name)}</dd>
      <dt>Email</dt><dd style="overflow-wrap:anywhere">${esc(s.user.email)}</dd>
      <dt>Age</dt><dd>${p.age}</dd>
      <dt>Height</dt><dd>${p.height} cm</dd>
      <dt>Weight</dt><dd>${p.weight} kg</dd>
      <dt>Fitness level</dt><dd>${level}</dd>
      <dt>Goal</dt><dd>${goal}</dd>
      <dt>Level</dt><dd>${s.progress.level}</dd>
    </dl>
    <button class="btn" data-act="editprof">Edit my data</button>
  </div>
  <div class="win">
    <span class="tag">[ Account ]</span>
    <button class="btn ghost" data-act="logout">Logout</button>
    ${resetBlock}
  </div>`;
}
