// Talks to the backend. Keeps the login token in localStorage.

const TOKEN_KEY = 'rankup-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Request failed.');
  return data;
}

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const api = {
  register: (name, email, password) => request('POST', '/api/auth/register', { name, email, password, tz: timezone() }),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),

  me: () => request('GET', '/api/me'),
  saveProfile: (profile) => request('PUT', '/api/me/profile', { ...profile, tz: timezone() }),
  savePlan: (plan) => request('PUT', '/api/me/plan', plan),
  dismissNotice: () => request('POST', '/api/me/dismiss-notice'),
  reset: () => request('POST', '/api/me/reset'),

  wake: () => request('POST', '/api/quests/wake'),
  water: (ml) => request('POST', '/api/quests/water', { ml }),
  exercise: (id) => request('POST', '/api/quests/exercise', { id }),
  sleep: () => request('POST', '/api/quests/sleep'),
};
