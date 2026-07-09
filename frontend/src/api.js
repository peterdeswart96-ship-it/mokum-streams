// API-basis: leeg = zelfde host (lokaal via proxy), of zet VITE_API_BASE naar de
// Azure Function App (bijv. https://<app>.azurewebsites.net). Auth (Entra External
// ID) komt in fase 3; nu draait dit tegen de open lokale backend.
const BASE = import.meta.env.VITE_API_BASE || '';

async function req(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const getPlanning = () => req('/api/manage/planning');
export const updatePlanning = (id, patch) =>
  req(`/api/manage/planning/${id}`, { method: 'POST', body: JSON.stringify(patch) });
