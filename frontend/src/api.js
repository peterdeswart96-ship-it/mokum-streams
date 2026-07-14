// API-basis: leeg = zelfde host (lokaal via proxy), of zet VITE_API_BASE naar de
// Azure Function App (bijv. https://<app>.azurewebsites.net).
//
// Auth: tijdelijk een admin-token (Bearer) dat de gebruiker eenmalig invult; het
// wordt in localStorage bewaard (NIET in de bundle) en als Bearer meegestuurd op
// beheer-endpoints. De definitieve auth is Entra External ID (fase 3).
const BASE = import.meta.env.VITE_API_BASE || '';
const TOKEN_KEY = 'mokum_admin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, (t || '').trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch {
      /* geen JSON-body */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Publiek (geen token nodig): live-status per cameratafel.
export const getLive = () => req('/api/live');
// Publiek: aankomende (enkeldaagse) toernooien binnen `days`.
export const getSchedule = (days = 7) => req(`/api/schedule?days=${days}`);

// Beheer (token vereist).
export const getConfig = () => req('/api/manage/config');
// Draait de Cuescore-planning-import nu meteen (i.p.v. de uurlijkse timer) en geeft
// { imported, total, items } terug — items = zelfde vorm als /api/schedule.
export const refreshPlanning = () =>
  req('/api/manage/planning-refresh', { method: 'POST' });
export const startStream = (body) =>
  req('/api/manage/streams/start', { method: 'POST', body: JSON.stringify(body) });
export const stopStream = (tableNumber) =>
  req('/api/manage/streams/stop', { method: 'POST', body: JSON.stringify({ tableNumber }) });
export const setOverlay = (body) =>
  req('/api/manage/streams/overlay', { method: 'POST', body: JSON.stringify(body) });

// Planning (toernooi-overzicht — nog niet in het bedienpaneel; voor later).
export const getPlanning = () => req('/api/manage/planning');
export const updatePlanning = (id, patch) =>
  req(`/api/manage/planning/${id}`, { method: 'POST', body: JSON.stringify(patch) });
