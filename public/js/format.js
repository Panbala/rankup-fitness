// Formatting helpers shared by the views.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');

// "18:05" -> "6:05 PM"
export function fmt12(hhmm) {
  const [h, m] = hhmm.split(':');
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const clockText = (d) => `${hhmm(d)}:${pad(d.getSeconds())}`;
export const toMinutes = (s) => {
  const [h, m] = s.split(':');
  return Number(h) * 60 + (Number(m) || 0);
};

// Quest day of the browser's clock. The day flips at 4 AM, matching the server.
export function localDayKey(d = new Date()) {
  const t = new Date(d.getTime() - 4 * 3600e3);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

// Suggested daily water goal from body weight (about 35 ml per kg).
export const recommendedWater = (kg) => Math.max(1500, Math.min(4500, Math.round((kg * 35) / 50) * 50));
