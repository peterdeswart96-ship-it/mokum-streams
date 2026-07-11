import { useCallback, useEffect, useState } from 'react';
import {
  getLive, startStream, stopStream, setOverlay,
  getToken, setToken as saveToken, clearToken,
} from './api.js';

const CAMERAS = [1, 3, 15, 16];
const REFRESH_MS = 5000;

// De 4 schakelbare overlays (sleutel = API-veld, label = wat de gebruiker ziet).
// Één plek: voeg hier een overlay toe en hij verschijnt in de tafelkaart én de wizard.
const OVERLAYS = [
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'scoreboard', label: 'Scorebord' },
  { key: 'scoresOtherTables', label: 'Scores andere tafels' },
  { key: 'cuescoreLogo', label: 'Cuescore-logo' },
];
const alleOverlaysAan = () => Object.fromEntries(OVERLAYS.map((o) => [o.key, true]));

// ── Login-poort ────────────────────────────────────────────────────────────
function Login({ onSaved }) {
  const [val, setVal] = useState('');
  return (
    <div className="max-w-md mx-auto mt-20 bg-white border border-slate-200 rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold mb-1">Inloggen</h2>
      <p className="text-sm text-slate-500 mb-4">
        Vul het beheer-token in (tijdelijk; Entra-login volgt later). Het blijft alleen in deze browser bewaard.
      </p>
      <input
        type="password"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="ADMIN_TOKEN"
        className="w-full border border-slate-300 rounded px-3 py-2 mb-3"
        onKeyDown={(e) => e.key === 'Enter' && val.trim() && (saveToken(val), onSaved())}
      />
      <button
        disabled={!val.trim()}
        onClick={() => { saveToken(val); onSaved(); }}
        className="w-full bg-emerald-700 text-white rounded px-4 py-2 font-medium disabled:opacity-40"
      >
        Opslaan
      </button>
    </div>
  );
}

// ── Kleine schakelaar ──────────────────────────────────────────────────────
function Toggle({ on, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex items-center gap-2 text-sm px-2 py-1 rounded border ${
        on ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-300 text-slate-500'
      }`}
    >
      <span className={`w-3 h-3 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {label}
    </button>
  );
}

// ── Statusbadge ────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    live: 'bg-red-100 text-red-700 border-red-200',
    scheduled: 'bg-amber-100 text-amber-700 border-amber-200',
    offline: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const label = { live: '● LIVE', scheduled: 'gepland', offline: 'offline' }[status] || status;
  return <span className={`text-xs px-2 py-0.5 rounded border ${map[status] || map.offline}`}>{label}</span>;
}

// ── Tafelkaart ─────────────────────────────────────────────────────────────
function TableCard({ table, onStop, onOverlay, busy }) {
  const actief = table.status === 'live' || table.status === 'scheduled';
  const [ov, setOv] = useState(alleOverlaysAan);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Tafel {table.tableNumber}</h3>
        <Badge status={table.status} />
      </div>
      {table.title && <p className="text-sm text-slate-600 truncate" title={table.title}>{table.title}</p>}
      {table.videoId && (
        <a href={`https://youtu.be/${table.videoId}`} target="_blank" rel="noreferrer"
           className="text-sm text-emerald-700 underline">Bekijk op YouTube ↗</a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {OVERLAYS.map((o) => (
          <Toggle key={o.key} on={ov[o.key]} label={o.label}
                  onChange={(v) => { setOv((s) => ({ ...s, [o.key]: v })); onOverlay(table.tableNumber, { [o.key]: v }); }} />
        ))}
      </div>
      {actief && (
        <button
          disabled={busy}
          onClick={() => onStop(table.tableNumber)}
          className="mt-3 w-full bg-slate-800 text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          Stop stream
        </button>
      )}
    </div>
  );
}

// ── Start-wizard ───────────────────────────────────────────────────────────
function Wizard({ onClose, onStarted }) {
  const [tafel, setTafel] = useState(CAMERAS[0]);
  const [titel, setTitel] = useState('');
  const [privacy, setPrivacy] = useState('unlisted');
  const [ov, setOv] = useState(alleOverlaysAan);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  async function start() {
    setBezig(true); setFout('');
    try {
      await startStream({ tableNumber: tafel, title: titel, privacy, overlays: ov });
      onStarted();
    } catch (e) {
      setFout(e.message);
      setBezig(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Nieuwe stream starten</h2>
        <label className="block text-sm font-medium mb-1">Tafel</label>
        <select value={tafel} onChange={(e) => setTafel(Number(e.target.value))}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-3">
          {CAMERAS.map((n) => <option key={n} value={n}>Tafel {n}</option>)}
        </select>

        <label className="block text-sm font-medium mb-1">YouTube-titel</label>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="bijv. Fluke ranking 9ball #22"
               className="w-full border border-slate-300 rounded px-3 py-2 mb-1" />
        <p className="text-xs text-slate-400 mb-3">Wordt: <span className="font-mono">Tafel {tafel} {titel}</span></p>

        <label className="block text-sm font-medium mb-1">Zichtbaarheid</label>
        <div className="flex gap-2 mb-3">
          {['unlisted', 'public', 'private'].map((p) => (
            <button key={p} onClick={() => setPrivacy(p)}
              className={`flex-1 rounded px-2 py-1.5 text-sm border ${
                privacy === p ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-slate-300'
              }`}>
              {{ unlisted: 'Verborgen', public: 'Openbaar', private: 'Privé' }[p]}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium mb-1">Overlays</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {OVERLAYS.map((o) => (
            <Toggle key={o.key} on={ov[o.key]} label={o.label}
                    onChange={(v) => setOv((s) => ({ ...s, [o.key]: v }))} />
          ))}
        </div>

        {fout && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-3">{fout}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 rounded px-4 py-2">Annuleren</button>
          <button disabled={bezig} onClick={start}
                  className="flex-1 bg-emerald-700 text-white rounded px-4 py-2 font-medium disabled:opacity-40">
            {bezig ? 'Starten…' : 'Start stream'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [ingelogd, setIngelogd] = useState(!!getToken());
  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState('laden');
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [melding, setMelding] = useState('');

  const laad = useCallback(async () => {
    try {
      const d = await getLive();
      const list = (d.tables && d.tables.length) ? d.tables : CAMERAS.map((n) => ({ tableNumber: n, status: 'offline' }));
      setTables(list.sort((a, b) => a.tableNumber - b.tableNumber));
      setStatus('ok');
    } catch {
      setStatus('fout');
    }
  }, []);

  useEffect(() => {
    if (!ingelogd) return;
    laad();
    const t = setInterval(laad, REFRESH_MS);
    return () => clearInterval(t);
  }, [ingelogd, laad]);

  async function actie(fn, okText) {
    setBusy(true); setMelding('');
    try { await fn(); if (okText) setMelding(okText); await laad(); }
    catch (e) {
      if (e.status === 401) { clearToken(); setIngelogd(false); }
      else setMelding(`Fout: ${e.message}`);
    } finally { setBusy(false); }
  }

  if (!ingelogd) return <Login onSaved={() => setIngelogd(true)} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-emerald-800 text-white px-6 py-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mokum Streams — Bedienpaneel</h1>
          <p className="text-emerald-100 text-sm">Streams starten/stoppen &amp; overlays</p>
        </div>
        <button onClick={() => { clearToken(); setIngelogd(false); }}
                className="text-emerald-100 text-sm underline">Uitloggen</button>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWizard(true)}
                  className="bg-emerald-700 text-white rounded-lg px-4 py-2 font-medium shadow-sm">
            + Nieuwe stream
          </button>
          {melding && <span className="text-sm text-slate-600">{melding}</span>}
        </div>

        {status === 'laden' && <p className="text-slate-500">Laden…</p>}
        {status === 'fout' && (
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
            Kon de status niet laden. Staat <code>VITE_API_BASE</code> goed en draait de backend?
          </p>
        )}
        {status === 'ok' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tables.map((t) => (
              <TableCard key={t.tableNumber} table={t} busy={busy}
                onStop={(n) => actie(() => stopStream(n), `Tafel ${n} gestopt`)}
                onOverlay={(n, patch) => actie(() => setOverlay({ tableNumber: n, ...patch }), `Overlay tafel ${n} bijgewerkt`)}
              />
            ))}
          </div>
        )}
      </main>

      {wizard && (
        <Wizard onClose={() => setWizard(false)}
                onStarted={() => { setWizard(false); setMelding('Stream gestart — OBS volgt via de agent.'); laad(); }} />
      )}
    </div>
  );
}
