import { useCallback, useEffect, useState } from 'react';
import {
  getLive, startStream, stopStream, setOverlay,
  getToken, setToken as saveToken, clearToken,
} from './api.js';

const CAMERAS = [1, 3, 15, 16];
const REFRESH_MS = 5000;

// De schakelbare overlays (sleutel = API-veld, label = wat de gebruiker ziet,
// desc = wat het toont, pos = waar op het beeld, groep = content|pauze, defaultOn =
// standaardstand). Één plek: voeg hier een overlay toe en hij verschijnt in de
// tafelkaart, de wizard én het uitleg-overzicht. Break-overlays (groep 'pauze') staan
// standaard uit en tonen we alleen tijdens een pauze.
const OVERLAYS = [
  { key: 'sponsors', label: 'Sponsors', desc: 'Roterende sponsorlogo’s (slideshow)', pos: 'rechtsboven', groep: 'content', defaultOn: true },
  { key: 'scoreboard', label: 'Scorebord', desc: 'Stand van déze tafel: spelers + score (race to …)', pos: 'onderin', groep: 'content', defaultOn: true },
  { key: 'scoresOtherTables', label: 'Scores andere tafels', desc: 'Toernooinaam, ronde en tafelnummer', pos: 'linksboven', groep: 'content', defaultOn: true },
  { key: 'cuescoreLogo', label: 'Cuescore-logo', desc: 'Het Cuescore-zeshoeklogo op het laken', pos: 'midden op de tafel', groep: 'content', defaultOn: true },
  { key: 'jumbotron', label: 'Jumbotron', desc: 'Alle tafels live (Cuescore) — voor tijdens pauzes', pos: 'volledig beeld', groep: 'pauze', defaultOn: false },
  { key: 'pauzemelding', label: 'Pauzemelding', desc: '“We wachten op de volgende wedstrijd…”', pos: 'volledig beeld', groep: 'pauze', defaultOn: false },
];
const CONTENT_OVERLAYS = OVERLAYS.filter((o) => o.groep === 'content');
const PAUZE_OVERLAYS = OVERLAYS.filter((o) => o.groep === 'pauze');
// De camera staat altijd aan (geen schakelaar) — wel tonen in het uitleg-overzicht
// zodat álle OBS-bronnen verklaard zijn.
const CAMERA_INFO = { key: 'camera', label: 'Camera', desc: 'Het live camerabeeld van de tafel', pos: 'achtergrond (altijd aan)' };
const standaardOverlays = () => Object.fromEntries(OVERLAYS.map((o) => [o.key, o.defaultOn]));

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
function Toggle({ on, onChange, label, title }) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={title}
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

// "1920x1080" + 60 + 9000 → "1080p60 · 9,0 Mbps" (kort, leesbaar in de kaart)
function fmtKwaliteit(q) {
  if (!q) return null;
  const hoogte = q.resolution ? q.resolution.split('x')[1] : null;
  const res = hoogte ? `${hoogte}p${q.fps ?? ''}` : (q.fps ? `${q.fps}fps` : '');
  const mbps = q.bitrateKbps ? `${(q.bitrateKbps / 1000).toFixed(1).replace('.', ',')} Mbps` : '';
  return [res, mbps].filter(Boolean).join(' · ');
}

// ── Overzichtsblok ─────────────────────────────────────────────────────────
// Compacte samenvatting bovenaan: hoeveel tafels live/gepland/offline, plus een
// waarschuwing als een live tafel onder 1080p uitzendt (na de scherpte-kwestie).
function Overzicht({ tables }) {
  const live = tables.filter((t) => t.status === 'live');
  const gepland = tables.filter((t) => t.status === 'scheduled');
  const offline = tables.filter((t) => t.status === 'offline');
  const laag = live.filter((t) => {
    const h = t.quality && t.quality.resolution ? Number(t.quality.resolution.split('x')[1]) : null;
    return h && h < 1080;
  });
  const Stat = ({ n, label, kleur }) => (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-bold ${kleur}`}>{n}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center gap-6 flex-wrap">
        <Stat n={`${live.length}/${tables.length}`} label="live" kleur="text-red-600" />
        <Stat n={gepland.length} label="gepland" kleur="text-amber-600" />
        <Stat n={offline.length} label="offline" kleur="text-slate-400" />
      </div>
      {laag.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
          ⚠ Lagere kwaliteit: {laag.map((t) => `Tafel ${t.tableNumber} (${t.quality.resolution})`).join(', ')}
        </p>
      )}
    </div>
  );
}

// ── Live wedstrijd-regel (uit Cuescore, via /api/live) ───────────────────────
function MatchRegel({ match }) {
  if (!match) return null;
  const st = String(match.status || '').toLowerCase();
  const live = st === 'playing';
  const label = live ? 'Nu live' : st === 'finished' ? 'afgelopen' : 'straks';
  return (
    <div className={`mt-2 rounded-lg px-2.5 py-1.5 border ${live ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="text-sm font-medium truncate">{match.playerA || '—'}</span>
        <span className="text-base font-bold tabular-nums whitespace-nowrap">{match.scoreA ?? 0}<span className="text-slate-400 mx-0.5">-</span>{match.scoreB ?? 0}</span>
        <span className="text-sm font-medium truncate text-right">{match.playerB || '—'}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {live && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        <span className="text-[11px] text-slate-500">{label}{match.round ? ` · ${match.round}` : ''}</span>
      </div>
    </div>
  );
}

// ── Tafelkaart ─────────────────────────────────────────────────────────────
function TableCard({ table, onStop, onOverlay, onPreview, busy }) {
  const actief = table.status === 'live' || table.status === 'scheduled';
  // Overlay-toggles: lokaal-optimistisch, maar volgen de echte OBS-stand zodra de
  // agent die meldt (table.overlays). Zonder agent-data blijft het lokale gedrag.
  const serverOv = table.overlays;
  const [ov, setOv] = useState(() => serverOv || standaardOverlays());
  useEffect(() => { if (serverOv) setOv(serverOv); }, [serverOv]);
  const kwaliteit = table.status === 'live' ? fmtKwaliteit(table.quality) : null;
  const toggle = (o) => (
    <Toggle key={o.key} on={!!ov[o.key]} label={o.label} title={`${o.desc} — ${o.pos}`}
            onChange={(v) => { setOv((s) => ({ ...s, [o.key]: v })); onOverlay(table.tableNumber, { [o.key]: v }); }} />
  );
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Tafel {table.tableNumber}</h3>
        <Badge status={table.status} />
      </div>
      {table.title && <p className="text-sm text-slate-600 truncate" title={table.title}>{table.title}</p>}
      <MatchRegel match={table.match} />
      {kwaliteit && <p className="text-xs text-slate-500 mt-0.5">🎥 {kwaliteit}</p>}
      {table.videoId && (
        <a href={`https://youtu.be/${table.videoId}`} target="_blank" rel="noreferrer"
           className="text-sm text-emerald-700 underline">Bekijk op YouTube ↗</a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {CONTENT_OVERLAYS.map(toggle)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Pauze</span>
        {PAUZE_OVERLAYS.map(toggle)}
      </div>
      <div className="mt-3 flex gap-2">
        {table.status === 'live' && table.videoId && (
          <button
            onClick={() => onPreview(table)}
            className="flex-1 bg-emerald-700 text-white rounded px-3 py-2 text-sm font-medium"
          >
            👁 Preview
          </button>
        )}
        {actief && (
          <button
            disabled={busy}
            onClick={() => onStop(table.tableNumber)}
            className="flex-1 bg-slate-800 text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-40"
          >
            Stop stream
          </button>
        )}
      </div>
    </div>
  );
}

// ── Start-wizard ───────────────────────────────────────────────────────────
function Wizard({ onClose, onStarted }) {
  const [tafel, setTafel] = useState(CAMERAS[0]);
  const [titel, setTitel] = useState('');
  const [privacy, setPrivacy] = useState('unlisted');
  const [ov, setOv] = useState(standaardOverlays);
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
          {CONTENT_OVERLAYS.map((o) => (
            <Toggle key={o.key} on={!!ov[o.key]} label={o.label} title={`${o.desc} — ${o.pos}`}
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

// ── Uitleg-overzicht van de overlays ─────────────────────────────────────────
function OverlayInfo({ onClose }) {
  const items = [...OVERLAYS, CAMERA_INFO];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Wat tonen de overlays?</h2>
        <p className="text-sm text-slate-500 mb-4">De grafische lagen over het camerabeeld — en waar ze staan.</p>
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.key} className="border-b border-slate-100 pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5">{o.pos}</span>
              </div>
              <p className="text-sm text-slate-600">{o.desc}</p>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-5 w-full border border-slate-300 rounded px-4 py-2">Sluiten</button>
      </div>
    </div>
  );
}

// ── Live stream-preview (YouTube-embed) ──────────────────────────────────────
function Preview({ table, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-10" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Tafel {table.tableNumber} — live</h2>
          <button onClick={onClose} className="text-slate-500 text-sm underline">Sluiten</button>
        </div>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full rounded"
            src={`https://www.youtube.com/embed/${table.videoId}?autoplay=1&mute=1`}
            title={`Tafel ${table.tableNumber}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <a href={`https://youtu.be/${table.videoId}`} target="_blank" rel="noreferrer"
           className="inline-block mt-3 text-sm text-emerald-700 underline">Openen op YouTube ↗</a>
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [preview, setPreview] = useState(null);

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
        <div className="flex items-center gap-4">
          <button onClick={() => setInfoOpen(true)}
                  className="text-emerald-100 text-sm underline">Uitleg overlays</button>
          <button onClick={() => { clearToken(); setIngelogd(false); }}
                  className="text-emerald-100 text-sm underline">Uitloggen</button>
        </div>
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
        {status === 'ok' && <Overzicht tables={tables} />}
        {status === 'ok' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tables.map((t) => (
              <TableCard key={t.tableNumber} table={t} busy={busy}
                onStop={(n) => actie(() => stopStream(n), `Tafel ${n} gestopt`)}
                onOverlay={(n, patch) => actie(() => setOverlay({ tableNumber: n, ...patch }), `Overlay tafel ${n} bijgewerkt`)}
                onPreview={(tafel) => setPreview(tafel)}
              />
            ))}
          </div>
        )}
      </main>

      {wizard && (
        <Wizard onClose={() => setWizard(false)}
                onStarted={() => { setWizard(false); setMelding('Stream gestart — OBS volgt via de agent.'); laad(); }} />
      )}
      {infoOpen && <OverlayInfo onClose={() => setInfoOpen(false)} />}
      {preview && <Preview table={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
