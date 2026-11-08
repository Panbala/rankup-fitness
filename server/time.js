// Time helpers. Every user has a timezone, and "today" resets at 4 AM local time,
// so a late-night workout still counts for the day you started.

export const DAY_RESET_HOUR = 4;

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Wall-clock parts of an instant in a timezone.
export function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

const pad = (n) => String(n).padStart(2, '0');

// "2026-11-06" style key for the quest day that `date` belongs to.
export function dayKey(date, tz) {
  const shifted = new Date(date.getTime() - DAY_RESET_HOUR * 3600e3);
  const { y, m, d } = localParts(shifted, tz);
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Minutes since local midnight.
export function nowMinutes(date, tz) {
  const { h, min } = localParts(date, tz);
  return h * 60 + min;
}

export function localHour(date, tz) {
  return localParts(date, tz).h;
}

// "06:30" -> 390
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':');
  return Number(h) * 60 + (Number(m) || 0);
}

export function isValidHHMM(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function weekdayShort(date, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
}
