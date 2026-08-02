// API-laag van de challenge-pagina (#90).
//
// Bewust los van src/api.js: dat is de beheerderskant met één gedeeld admin-token. Hier
// heeft elk LID zijn eigen token, dat we terugkrijgen na inloggen met Cuescore-gegevens.
// Het wachtwoord wordt alleen doorgegeven bij het inloggen en nooit bewaard in de browser.

const BASE = import.meta.env.VITE_API_BASE || '';
const TOKEN_KEY = 'mokum_challenge_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, (t || '').trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req(pad, opties = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opties.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${pad}`, { ...opties, headers });
  if (!res.ok) {
    let melding = `HTTP ${res.status}`;
    let opnieuwInloggen = false;
    try {
      const j = await res.json();
      if (j && j.error) melding = j.error;
      opnieuwInloggen = !!(j && j.opnieuwInloggen);
    } catch { /* geen JSON-body */ }
    const fout = new Error(melding);
    fout.status = res.status;
    // De backend zegt zelf wanneer de koppeling stuk is (verlopen token, gewijzigd
    // Cuescore-wachtwoord). Dan gooit de pagina het token weg en vraagt opnieuw.
    fout.opnieuwInloggen = opnieuwInloggen;
    throw fout;
  }
  return res.status === 204 ? null : res.json();
}

export const login = (email, wachtwoord) =>
  req('/api/challenge/login', { method: 'POST', body: JSON.stringify({ email, wachtwoord }) });

export const getMe = () => req('/api/challenge/me');

export const zoekSpelers = (q) => req(`/api/challenge/spelers?q=${encodeURIComponent(q)}`);

export const maakChallenge = (gegevens) =>
  req('/api/challenge/aanmaken', { method: 'POST', body: JSON.stringify(gegevens) });

export const bewaarSjablonen = (sjablonen) =>
  req('/api/challenge/sjablonen', { method: 'POST', body: JSON.stringify({ sjablonen }) });

export const loskoppelen = () => req('/api/challenge/loskoppelen', { method: 'POST' });
