// Small browser-only helpers: toasts, full-screen overlays and the alarm sound.

import { fmt12 } from './format.js';

const $ = (selector) => document.querySelector(selector);

export function toast(message) {
  const el = document.createElement('div');
  el.className = 't';
  el.textContent = message;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export function showLevelUp(level, rank) {
  const el = $('#lv');
  el.innerHTML = `<div>
    <p class="tag">[ System ]</p>
    <h2>Level up</h2>
    <p class="big">${level}</p>
    <p class="muted">Rank ${rank}. All stats +1. Tomorrow's quests are a little harder.</p>
    <button class="btn primary" data-act="closelv">Continue</button>
  </div>`;
  el.hidden = false;
}
export const hideLevelUp = () => ($('#lv').hidden = true);

/* ---------- alarm ---------- */

let audio = null;
let beepTimer = null;

function startBeep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {
    return;
  }
  clearInterval(beepTimer);
  beepTimer = setInterval(() => {
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.12, audio.currentTime);
      osc.start();
      osc.stop(audio.currentTime + 0.25);
    } catch {
      /* ignore audio errors */
    }
  }, 700);
}

// kind is 'real' (counts for the wake quest) or 'test' (just a sound check).
export function showAlarm(wakeTime, kind) {
  const el = $('#ring');
  el.innerHTML = `<div>
    <p class="tag">[ Alarm ]</p>
    <p class="big">${fmt12(wakeTime)}</p>
    <h2>Wake up</h2>
    <p class="muted">Dismiss to claim your on-time wake up quest.</p>
    <button class="btn primary" data-act="ringoff" data-v="${kind}">I am awake</button>
  </div>`;
  el.hidden = false;
  startBeep();
}

export function hideAlarm() {
  clearInterval(beepTimer);
  $('#ring').hidden = true;
}
