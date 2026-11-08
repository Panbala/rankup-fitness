// App controller: holds the current server state, renders views, handles clicks and timers.

import { api, ApiError, getToken, setToken } from './api.js';
import { authView, onboardView, wireOnboardForm, statusView, questsView, planView, profileView, nav } from './views.js';
import { toast, showLevelUp, hideLevelUp, showAlarm, hideAlarm } from './ui.js';
import { clockText, hhmm, localDayKey, toMinutes } from './format.js';

const $ = (selector) => document.querySelector(selector);

// `state` is whatever the server last sent (null while logged out). `ui` is screen-only state.
let state = null;
const ui = { tab: 'status', authMode: 'login', authError: '', editing: false, confirmReset: false };
let loadedDay = localDayKey();

/* ---------- rendering ---------- */

function render() {
  const root = $('#app');
  if (!state) {
    root.innerHTML = authView({ mode: ui.authMode, error: ui.authError });
    return;
  }
  if (!state.onboarded || ui.editing) {
    root.innerHTML = onboardView(state);
    wireOnboardForm();
    return;
  }
  const views = { status: statusView, quests: questsView, plan: planView, profile: (s) => profileView(s, ui) };
  root.innerHTML = `<div class="wrap">${(views[ui.tab] || statusView)(state)}</div>${nav(ui.tab)}`;
  tickClock();
}

// Takes a fresh server response: update state, show toasts and level-ups, redraw.
function apply(response) {
  const { events = [], ...next } = response;
  state = next;
  loadedDay = localDayKey();
  let levelUp = null;
  for (const e of events) {
    if (e.type === 'xp') toast(`+${e.xp} XP  ${e.message}`);
    if (e.type === 'bonus') toast(`${e.message} +${e.xp} XP bonus`);
    if (e.type === 'levelup') levelUp = e;
  }
  render();
  if (levelUp) showLevelUp(levelUp.level, levelUp.rank);
}

function logout() {
  setToken(null);
  hideAlarm();
  state = null;
  Object.assign(ui, { tab: 'status', confirmReset: false, editing: false });
  render();
}

// Runs an API call and applies the result. Expired logins go back to the login screen.
async function run(call) {
  try {
    apply(await call());
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) logout();
    else toast(err.message);
    return false;
  }
}

/* ---------- clicks ---------- */

const ACTIONS = {
  mode: (v) => { ui.authMode = v; ui.authError = ''; render(); },
  tab: (v) => { ui.tab = v; ui.confirmReset = false; render(); window.scrollTo(0, 0); },
  wake: () => run(api.wake),
  water: (v) => run(() => api.water(Number(v))),
  ex: (v) => run(() => api.exercise(v)),
  sleep: () => run(api.sleep),
  dismiss: () => run(api.dismissNotice),
  closelv: hideLevelUp,
  testalarm: () => showAlarm(state.plan.wake, 'test'),
  ringoff: (v) => {
    hideAlarm();
    if (v === 'real' && !state.today.wake) run(api.wake);
  },
  logout,
  reset1: () => { ui.confirmReset = true; render(); },
  reset0: () => { ui.confirmReset = false; render(); },
  reset2: async () => {
    ui.confirmReset = false;
    ui.tab = 'status';
    if (await run(api.reset)) toast('Progress reset');
  },
  editprof: () => { ui.editing = true; render(); window.scrollTo(0, 0); },
  canceledit: () => { ui.editing = false; render(); },
};

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-act]');
  if (!button || button.disabled) return;
  ACTIONS[button.dataset.act]?.(button.dataset.v);
});

// Plan tab inputs save as soon as they change.
document.addEventListener('change', async (e) => {
  const key = e.target.dataset?.set;
  if (!key || !state) return;
  let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if ((key === 'wake' || key === 'bed') && !value) return;
  if (key === 'water') value = Number(value);
  if (await run(() => api.savePlan({ [key]: value }))) toast('Saved');
  else render(); // put the old value back after a rejected edit
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'authForm') submitAuth();
  if (e.target.id === 'obForm') submitOnboarding();
});

/* ---------- forms ---------- */

function setAuthError(message) {
  ui.authError = message;
  const el = $('#a-err');
  if (el) el.textContent = message;
}

async function submitAuth() {
  const email = $('#a-email').value.trim();
  const password = $('#a-pass').value;
  try {
    const result = ui.authMode === 'register'
      ? await api.register($('#a-name').value.trim(), email, password)
      : await api.login(email, password);
    setToken(result.token);
    ui.authError = '';
    ui.tab = 'status';
    apply(result.state);
  } catch (err) {
    setAuthError(err.message);
  }
}

async function submitOnboarding() {
  const value = (id) => $(id).value;
  const first = !state.onboarded;
  try {
    const response = await api.saveProfile({
      age: Number(value('#o-age')),
      gender: value('#o-gender'),
      height: Number(value('#o-height')),
      weight: Number(value('#o-weight')),
      act: value('#o-act'),
      goal: value('#o-goal'),
      wake: value('#o-wake'),
      bed: value('#o-bed'),
      water: Number(value('#o-water')),
    });
    ui.editing = false;
    ui.tab = 'status';
    apply(response);
    window.scrollTo(0, 0);
    toast(first ? 'Data saved' : 'Changes saved');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) logout();
    else $('#o-err').textContent = err.message;
  }
}

/* ---------- clock, alarm and reminders (1 tick per second) ---------- */

let alarmDay = '';
let bedReminderDay = '';
let lastWaterReminder = Date.now();

function tickClock() {
  const el = $('#clk');
  if (el) el.textContent = clockText(new Date());
}

setInterval(() => {
  tickClock();
  if (!state || !state.onboarded) return;
  const now = new Date();
  const day = localDayKey(now);

  // New quest day started while the page was open: ask the server for the fresh day.
  if (day !== loadedDay) {
    loadedDay = day;
    run(api.me);
    return;
  }

  const { plan, today } = state;
  if (plan.alarm && hhmm(now) === plan.wake && alarmDay !== day && !today.wake) {
    alarmDay = day;
    showAlarm(plan.wake, 'real');
  }
  if (plan.remind) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    const wake = toMinutes(plan.wake);
    const bed = toMinutes(plan.bed);
    if (minutes >= wake && minutes < bed && !today.waterDone && Date.now() - lastWaterReminder > 90 * 60e3) {
      lastWaterReminder = Date.now();
      toast('Time to drink water');
    }
    if (minutes >= bed - 30 && minutes < bed && bedReminderDay !== day && !today.sleep) {
      bedReminderDay = day;
      toast('Bedtime in 30 minutes. Wind down.');
    }
  }
}, 1000);

/* ---------- boot ---------- */

async function boot() {
  if (!getToken()) return render();
  try {
    apply(await api.me());
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) toast(err.message);
    else setToken(null);
    render();
  }
}

boot();
