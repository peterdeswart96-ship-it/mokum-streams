import { useEffect, useMemo, useState } from 'react';
import { getPlanning, updatePlanning } from './api.js';
import PlanningRow from './components/PlanningRow.jsx';

const CAMERAS = [1, 3, 15, 16];

export default function App() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('laden'); // laden | ok | fout
  const [zoek, setZoek] = useState('');
  const [alleenAan, setAlleenAan] = useState(false);

  useEffect(() => {
    getPlanning()
      .then((d) => {
        setItems(d.items || []);
        setStatus('ok');
      })
      .catch(() => setStatus('fout'));
  }, []);

  const zichtbaar = useMemo(
    () =>
      items.filter((r) => {
        if (alleenAan && r.enabled === false) return false;
        if (zoek && !(r.name || '').toLowerCase().includes(zoek.toLowerCase())) return false;
        return true;
      }),
    [items, zoek, alleenAan]
  );

  async function wijzig(id, patch) {
    // Optimistisch bijwerken; bij een API-fout laten we het staan (skeleton).
    setItems((prev) =>
      prev.map((r) => (String(r.tournamentId) === String(id) ? { ...r, ...patch } : r))
    );
    try {
      await updatePlanning(id, patch);
    } catch {
      /* later: terugdraaien + melding */
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-emerald-800 text-white px-6 py-4 shadow">
        <h1 className="text-xl font-semibold">Mokum Streams — Dashboard</h1>
        <p className="text-emerald-100 text-sm">Planning van toernooien &amp; competities</p>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek toernooi…"
            className="border border-slate-300 rounded px-3 py-2 flex-1 min-w-[12rem]"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alleenAan} onChange={(e) => setAlleenAan(e.target.checked)} />
            Alleen ingeschakeld
          </label>
        </div>

        {status === 'laden' && <p className="text-slate-500">Planning laden…</p>}
        {status === 'fout' && (
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
            Kon de planning niet laden. Draait de backend en staat <code>VITE_API_BASE</code> goed?
          </p>
        )}
        {status === 'ok' && zichtbaar.length === 0 && (
          <p className="text-slate-500">Geen toernooien gevonden.</p>
        )}

        {status === 'ok' && zichtbaar.length > 0 && (
          <div className="space-y-3">
            {zichtbaar.map((r) => (
              <PlanningRow key={r.tournamentId} record={r} cameras={CAMERAS} onChange={wijzig} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
