import { useCallback, useEffect, useState } from 'react';
import {
  getLive, startStream, stopStream, setOverlay, refreshPlanning, getPlanning, updatePlanning,
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
  { key: 'scoreboard', label: 'Scorebord', desc: 'Officiële Cuescore-overlay: toernooikop (linksboven) + stand van déze tafel (onderin)', pos: 'onderin + linksboven', groep: 'content', defaultOn: true },
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
    <div className="max-w-md mx-auto mt-20 bg-surface border border-line rounded-lg shadow-2xl p-6">
      <h2 className="text-lg font-display mb-1">Inloggen</h2>
      <p className="text-sm text-ink-muted mb-4">
        Vul het beheer-token in (tijdelijk; Entra-login volgt later). Het blijft alleen in deze browser bewaard.
      </p>
      <input
        type="password"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="ADMIN_TOKEN"
        className="w-full bg-canvas border border-line rounded px-3 py-2 mb-3 text-ink placeholder:text-neutral-500"
        onKeyDown={(e) => e.key === 'Enter' && val.trim() && (saveToken(val), onSaved())}
      />
      <button
        disabled={!val.trim()}
        onClick={() => { saveToken(val); onSaved(); }}
        className="w-full bg-brand hover:bg-brand-dark text-white rounded px-4 py-2 font-medium disabled:opacity-40"
      >
        Opslaan
      </button>
    </div>
  );
}

// ── Kleine schakelaar ──────────────────────────────────────────────────────
function Toggle({ on, onChange, label, title, busy }) {
  return (
    <button
      onClick={() => !busy && onChange(!on)}
      disabled={busy}
      title={title}
      className={`flex items-center gap-2 text-sm px-2 py-1 rounded border ${
        on ? 'bg-brand/20 border-brand text-ink' : 'bg-surface-raised border-line text-ink-muted'
      } ${busy ? 'opacity-60 cursor-wait' : ''}`}
    >
      <span className={`w-3 h-3 rounded-full ${busy ? 'bg-amber-400 animate-pulse' : on ? 'bg-brand' : 'bg-neutral-600'}`} />
      {label}
    </button>
  );
}

// ── Toasts (tijdelijke meldingen rechtsonder) ────────────────────────────────
function Toaster({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`text-left rounded-lg px-4 py-2.5 text-sm shadow-2xl border text-white ${
            t.type === 'fout' ? 'bg-brand border-brand-dark' : 'bg-emerald-600 border-emerald-700'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

// "X sec/min geleden" (kort). null → "—".
function geleden(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3) return 'zojuist';
  if (s < 60) return `${s}s geleden`;
  const m = Math.round(s / 60);
  return `${m}m geleden`;
}

// ── Verversingsstatus (tikt zelf elke seconde, los van de rest) ──────────────
function VerversStatus({ lastUpdated, status, onRefresh }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const kleur = status === 'ok' ? 'bg-emerald-500' : status === 'fout' ? 'bg-brand' : 'bg-amber-400 animate-pulse';
  const tekst = status === 'fout' ? 'verbinding kwijt' : `bijgewerkt ${geleden(lastUpdated ? Date.now() - lastUpdated : null)}`;
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <span className={`w-2 h-2 rounded-full ${kleur}`} />
      <span>{tekst}</span>
      <button onClick={onRefresh} title="Nu verversen" className="text-neutral-500 hover:text-ink text-base leading-none">↻</button>
    </div>
  );
}

// ── Statusbadge ────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    live: 'bg-brand/20 text-brand-light border-brand/40',
    scheduled: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    offline: 'bg-neutral-700/40 text-neutral-400 border-neutral-600',
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
function Overzicht({ tables, venueLive }) {
  const live = tables.filter((t) => t.status === 'live');
  const gepland = tables.filter((t) => t.status === 'scheduled');
  const offline = tables.filter((t) => t.status === 'offline');
  const laag = live.filter((t) => {
    const h = t.quality && t.quality.resolution ? Number(t.quality.resolution.split('x')[1]) : null;
    return h && h < 1080;
  });
  const Stat = ({ n, label, kleur }) => (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-display ${kleur}`}>{n}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </div>
  );
  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg p-4 mb-4">
      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
        <Stat n={`${live.length}/${tables.length}`} label="live" kleur="text-brand-light" />
        <Stat n={gepland.length} label="gepland" kleur="text-amber-400" />
        <Stat n={offline.length} label="offline" kleur="text-neutral-500" />
        {venueLive != null && (
          <div className="flex items-baseline gap-1.5 sm:ml-auto">
            <span className="text-2xl font-display text-ink">{venueLive}</span>
            <span className="text-sm text-ink-muted">wedstrijd{venueLive === 1 ? '' : 'en'} live in de zaal</span>
          </div>
        )}
      </div>
      {laag.length > 0 && (
        <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded p-2 mt-3">
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
    <div className={`mt-2 rounded-lg px-2.5 py-1.5 border ${live ? 'bg-brand/10 border-brand/40' : 'bg-surface-raised border-line'}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="text-sm font-medium truncate">{match.playerA || '—'}</span>
        <span className="text-base font-bold tabular-nums whitespace-nowrap">{match.scoreA ?? 0}<span className="text-neutral-500 mx-0.5">-</span>{match.scoreB ?? 0}</span>
        <span className="text-sm font-medium truncate text-right">{match.playerB || '—'}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {live && <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />}
        <span className="text-[11px] text-ink-muted">{label}{match.round ? ` · ${match.round}` : ''}</span>
      </div>
    </div>
  );
}

// ── Tafelkaart ─────────────────────────────────────────────────────────────
// YouTube-icoon rechtsboven op de tafelkaart: grijs bij offline, opgelicht + rode
// gloed-puls (5s) bij live, en dan klikbaar naar de livestream.
function YouTubeIcoon({ table }) {
  const live = table.status === 'live';
  const videoId = table.videoId || table.liveVideoId;
  const img = (
    <img src="/youtube.png" alt="YouTube"
         className={`w-10 h-10 rounded-lg transition ${live ? 'yt-live' : 'grayscale opacity-40'}`} />
  );
  if (live && videoId) {
    return (
      <a href={`https://youtu.be/${videoId}`} target="_blank" rel="noreferrer"
         title="Bekijk live op YouTube" className="shrink-0">{img}</a>
    );
  }
  return <span className="shrink-0" title={live ? 'Live op YouTube' : 'Offline'}>{img}</span>;
}

function TableCard({ table, onStop, onOverlay, onPreview, busy }) {
  const actief = table.status === 'live' || table.status === 'scheduled';
  // Overlay-toggles: lokaal-optimistisch, maar volgen de echte OBS-stand zodra de
  // agent die meldt (table.overlays). Zonder agent-data blijft het lokale gedrag.
  const serverOv = table.overlays;
  const [ov, setOv] = useState(() => serverOv || standaardOverlays());
  const [pending, setPending] = useState({});
  useEffect(() => { if (serverOv) setOv(serverOv); }, [serverOv]);
  const kwaliteit = table.status === 'live' ? fmtKwaliteit(table.quality) : null;
  // Optimistisch schakelen, maar bij een mislukte API-call terugdraaien (rollback)
  // zodat de knop de werkelijke stand toont. onOverlay geeft true/false terug.
  const schakel = async (key, v) => {
    const vorige = ov[key];
    setOv((s) => ({ ...s, [key]: v }));
    setPending((p) => ({ ...p, [key]: true }));
    const ok = await onOverlay(table.tableNumber, { [key]: v });
    setPending((p) => ({ ...p, [key]: false }));
    if (!ok) setOv((s) => ({ ...s, [key]: vorige })); // terugdraaien
  };
  const toggle = (o) => (
    <Toggle key={o.key} on={!!ov[o.key]} label={o.label} title={`${o.desc} — ${o.pos}`}
            busy={!!pending[o.key]} onChange={(v) => schakel(o.key, v)} />
  );
  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display">Tafel {table.tableNumber}</h3>
        <div className="flex items-center gap-2">
          {table.status !== 'offline' && <Badge status={table.status} />}
          <YouTubeIcoon table={table} />
        </div>
      </div>
      {table.title && <p className="text-sm text-ink-muted truncate" title={table.title}>{table.title}</p>}
      <MatchRegel match={table.match} />
      {kwaliteit && <p className="text-xs text-ink-muted mt-0.5">🎥 {kwaliteit}</p>}
      {table.videoId && (
        <a href={`https://youtu.be/${table.videoId}`} target="_blank" rel="noreferrer"
           className="text-sm text-brand-light underline">Bekijk op YouTube ↗</a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {CONTENT_OVERLAYS.map(toggle)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500 uppercase tracking-wide">Pauze</span>
        {PAUZE_OVERLAYS.map(toggle)}
      </div>
      <div className="mt-3 flex gap-2">
        {table.status === 'live' && table.videoId && (
          <button
            onClick={() => onPreview(table)}
            className="flex-1 bg-brand hover:bg-brand-dark text-white rounded px-3 py-2 text-sm font-medium"
          >
            👁 Preview
          </button>
        )}
        {actief && (
          <button
            disabled={busy}
            onClick={() => onStop(table.tableNumber)}
            className="flex-1 bg-surface-raised hover:bg-neutral-700 text-ink border border-line rounded px-3 py-2 text-sm font-medium disabled:opacity-40"
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
  const [privacy, setPrivacy] = useState('public'); // standaard Openbaar (streams zijn bedoeld voor publiek); Verborgen alleen bewust kiezen voor een test
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
      <div className="bg-surface text-ink border border-line rounded-lg shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-display mb-4">Nieuwe stream starten</h2>
        <label className="block text-sm font-medium mb-1">Tafel</label>
        <select value={tafel} onChange={(e) => setTafel(Number(e.target.value))}
                className="w-full bg-canvas border border-line rounded px-3 py-2 mb-3 text-ink">
          {CAMERAS.map((n) => <option key={n} value={n}>Tafel {n}</option>)}
        </select>

        <label className="block text-sm font-medium mb-1">YouTube-titel</label>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="bijv. Fluke ranking 9ball #22"
               className="w-full bg-canvas border border-line rounded px-3 py-2 mb-1 text-ink placeholder:text-neutral-500" />
        <p className="text-xs text-neutral-500 mb-3">Wordt: <span className="font-mono">Tafel {tafel} {titel}</span></p>

        <label className="block text-sm font-medium mb-1">Zichtbaarheid</label>
        <div className="flex gap-2 mb-3">
          {['unlisted', 'public', 'private'].map((p) => (
            <button key={p} onClick={() => setPrivacy(p)}
              className={`flex-1 rounded px-2 py-1.5 text-sm border ${
                privacy === p ? 'bg-brand text-white border-brand' : 'bg-canvas border-line text-ink-muted'
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

        {fout && <p className="text-sm text-brand-light bg-brand/10 border border-brand/40 rounded p-2 mb-3">{fout}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-line text-ink rounded px-4 py-2">Annuleren</button>
          <button disabled={bezig} onClick={start}
                  className="flex-1 bg-brand hover:bg-brand-dark text-white rounded px-4 py-2 font-medium disabled:opacity-40">
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-10" onClick={onClose}>
      <div className="bg-surface text-ink border border-line rounded-lg shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-display mb-1">Wat tonen de overlays?</h2>
        <p className="text-sm text-ink-muted mb-4">De grafische lagen over het camerabeeld — en waar ze staan.</p>
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.key} className="border-b border-line pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-ink-muted bg-surface-raised rounded px-2 py-0.5">{o.pos}</span>
              </div>
              <p className="text-sm text-ink-muted">{o.desc}</p>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-5 w-full border border-line text-ink rounded px-4 py-2">Sluiten</button>
      </div>
    </div>
  );
}

// ── Live stream-preview (YouTube-embed) ──────────────────────────────────────
function Preview({ table, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-10" onClick={onClose}>
      <div className="bg-surface text-ink border border-line rounded-lg shadow-2xl w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display">Tafel {table.tableNumber} — live</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-sm underline">Sluiten</button>
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
           className="inline-block mt-3 text-sm text-brand-light underline">Openen op YouTube ↗</a>
      </div>
    </div>
  );
}

// ── Live stream-paneel (YouTube-embed met tafel-switcher) ────────────────────
// Toont de echte YouTube-stream van een gekozen tafel, zodat je overlay-wijzigingen
// op het beeld kunt controleren (met de normale YouTube-vertraging). Gebruikt
// liveVideoId (uit /api/live) — werkt ook voor handmatig gestarte streams.
function StreamPaneel({ tables }) {
  const [sel, setSel] = useState(CAMERAS[0]);
  const t = tables.find((c) => c.tableNumber === sel) || tables[0];
  const vid = t && (t.liveVideoId || t.videoId);
  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display">Livestream</h3>
        <div className="flex gap-1.5 flex-wrap">
          {tables.map((c) => {
            const heeft = !!(c.liveVideoId || c.videoId);
            const actief = t && c.tableNumber === t.tableNumber;
            return (
              <button key={c.tableNumber} onClick={() => setSel(c.tableNumber)}
                className={`px-3 py-1 rounded text-sm border flex items-center gap-1.5 ${
                  actief ? 'bg-brand border-brand text-white' : 'bg-surface-raised border-line text-ink-muted'
                }`}>
                {heeft && <span className="w-1.5 h-1.5 rounded-full bg-brand-light" />}
                Tafel {c.tableNumber}
              </button>
            );
          })}
        </div>
      </div>
      {vid ? (
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            key={vid}
            className="absolute inset-0 w-full h-full rounded"
            src={`https://www.youtube.com/embed/${vid}?autoplay=1&mute=1`}
            title={`Tafel ${t.tableNumber} livestream`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="text-ink-muted text-sm py-12 text-center border border-line rounded bg-canvas">
          Geen livestream gevonden voor Tafel {t && t.tableNumber}.
        </div>
      )}
      <p className="text-[11px] text-neutral-500 mt-2">
        YouTube-vertraging ~10-30s — overlay-wijzigingen zie je met wat vertraging.
      </p>
    </div>
  );
}

// Datum 'YYYY-MM-DD' → leesbaar: "Vandaag" / "Morgen" / "di 15 jul".
function datumLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const verschil = Math.round((d - vandaag) / 86400000);
  if (verschil === 0) return 'Vandaag';
  if (verschil === 1) return 'Morgen';
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Toernooi planner (EPIC #42, fase 1: plannen + opslaan; auto start/stop volgt) ──
// Toont de eerstvolgende ~10 Cuescore-toernooien (uit /api/manage/planning). Per
// toernooi kies je Tafels + Zichtbaarheid + Overlays en leg je met "Plan" (na
// bevestiging) de planning vast (record.planned = true). NB: fase 1 zet nog niets
// automatisch live — dat komt in fase 2/3.
const VIS_LABELS = { public: 'Openbaar', unlisted: 'Verborgen', private: 'Privé' };
const OVERLAY_PRESETS = [
  { key: 'alle', label: 'Alle', overlays: { sponsors: true, scoreboard: true } },
  { key: 'scorebord', label: 'Alleen scorebord', overlays: { sponsors: false, scoreboard: true } },
  { key: 'geen', label: 'Geen', overlays: { sponsors: false, scoreboard: false } },
];
function overlaysNaarPreset(ov) {
  const s = !!(ov && ov.sponsors); const b = !!(ov && ov.scoreboard);
  if (!s && b) return 'scorebord';
  if (!s && !b) return 'geen';
  return 'alle';
}
function tijdVan(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function ToernooiPlanner({ onGepland }) {
  const [records, setRecords] = useState(null); // null = laden
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [edits, setEdits] = useState({});       // tournamentId -> { tafels, visibility, overlayPreset, preRoll }
  const [confirm, setConfirm] = useState(null); // record dat bevestigd wordt

  const laad = useCallback(() => {
    return getPlanning().then((d) => {
      const drempel = Date.now() - 12 * 3600 * 1000; // vandaag telt nog mee
      const lijst = (d.items || [])
        .filter((r) => (r.type || 'tournament') !== 'competition')
        .filter((r) => {
          const t = Date.parse(r.plannedStart || `${r.date}T00:00:00Z`);
          return !Number.isNaN(t) && t >= drempel;
        })
        .sort((a, b) => String(a.plannedStart || a.date).localeCompare(String(b.plannedStart || b.date)))
        .slice(0, 10);
      setRecords(lijst);
    }).catch(() => setRecords([]));
  }, []);
  useEffect(() => { laad(); }, [laad]);

  function huidig(r) {
    const e = edits[r.tournamentId] || {};
    return {
      tafels: e.tafels ?? (r.tafels || []),
      visibility: e.visibility ?? (r.visibility || 'public'),
      overlayPreset: e.overlayPreset ?? overlaysNaarPreset(r.overlays),
      preRoll: e.preRoll ?? (r.preRollMinuten ?? 10),
    };
  }
  function wijzig(r, patch) {
    setEdits((prev) => ({ ...prev, [r.tournamentId]: { ...huidig(r), ...patch } }));
  }
  function toggleTafel(r, n) {
    const cur = huidig(r).tafels;
    wijzig(r, { tafels: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b) });
  }
  async function doe(fn, faalTekst) {
    setBezig(true); setFout('');
    try { await fn(); await laad(); if (onGepland) onGepland(); }
    catch (e) { setFout(e.message || faalTekst); }
    finally { setBezig(false); }
  }
  function plan(r) {
    const cur = huidig(r);
    const preset = OVERLAY_PRESETS.find((p) => p.key === cur.overlayPreset) || OVERLAY_PRESETS[0];
    return doe(async () => {
      await updatePlanning(r.tournamentId, {
        tafels: cur.tafels, visibility: cur.visibility, overlays: preset.overlays,
        preRollMinuten: cur.preRoll, planned: true,
      });
      setConfirm(null);
    }, 'Plannen mislukt');
  }
  const annuleer = (r) => doe(() => updatePlanning(r.tournamentId, { planned: false }), 'Annuleren mislukt');
  const ververs = () => doe(() => refreshPlanning(), 'Verversen mislukt');

  const aantalGepland = Array.isArray(records) ? records.filter((r) => r.planned).length : 0;
  const cell = 'px-2 py-2 align-middle';
  const sel = 'bg-canvas border border-line rounded px-1.5 py-1 text-xs text-ink disabled:opacity-60';

  return (
    <div className="bg-surface border border-line rounded-lg shadow-lg">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="font-display flex items-center gap-2">
          Toernooi planner
          {aantalGepland > 0 && (
            <span className="text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-full px-2 py-0.5">{aantalGepland} gepland</span>
          )}
        </span>
        <span className={`text-ink-muted text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {records == null ? (
            <p className="text-sm text-ink-muted">Laden…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-ink-muted">Geen aankomende toernooien. Klik “↻ Ververs” om Cuescore op te halen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[860px]">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-line">
                    <th className={cell}>Datum</th><th className={cell}>Tafels</th><th className={cell}>Start</th>
                    <th className={cell}>Toernooi</th><th className={cell}>Eind</th><th className={cell}>Zichtbaarheid</th>
                    <th className={cell}>Overlays</th><th className={cell}>Status</th><th className={cell}>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const cur = huidig(r);
                    const gepland = !!r.planned;
                    return (
                      <tr key={r.tournamentId} className="border-b border-line/50">
                        <td className={cell}><span className="whitespace-nowrap">{datumLabel(r.date)}</span></td>
                        <td className={cell}>
                          <div className="flex gap-1">
                            {CAMERAS.map((n) => (
                              <button key={n} disabled={gepland} onClick={() => toggleTafel(r, n)}
                                className={`w-6 h-6 rounded text-xs border ${cur.tafels.includes(n) ? 'bg-brand text-white border-brand' : 'bg-canvas text-ink-muted border-line'} ${gepland ? 'opacity-60 cursor-default' : ''}`}>{n}</button>
                            ))}
                          </div>
                        </td>
                        <td className={cell}><span className="whitespace-nowrap">{tijdVan(r.plannedStart)}</span></td>
                        <td className={`${cell} max-w-[16rem]`}><span className="block truncate" title={r.name}>{r.name}</span></td>
                        <td className={cell}><span className="whitespace-nowrap">{tijdVan(r.plannedStop)}</span></td>
                        <td className={cell}>
                          <select className={sel} value={cur.visibility} disabled={gepland} onChange={(e) => wijzig(r, { visibility: e.target.value })}>
                            {Object.entries(VIS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td className={cell}>
                          <select className={sel} value={cur.overlayPreset} disabled={gepland} onChange={(e) => wijzig(r, { overlayPreset: e.target.value })}>
                            {OVERLAY_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                        </td>
                        <td className={cell}>
                          {gepland
                            ? <span className="text-emerald-400 text-xs font-medium whitespace-nowrap">● Gepland</span>
                            : <span className="text-ink-muted text-xs">Concept</span>}
                        </td>
                        <td className={cell}>
                          {gepland
                            ? <button onClick={() => annuleer(r)} disabled={bezig} className="text-xs text-brand-light underline disabled:opacity-50">Annuleren</button>
                            : <button onClick={() => setConfirm(r)} disabled={bezig || cur.tafels.length === 0}
                                      className="bg-brand hover:bg-brand-dark text-white rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50">Plan</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {fout && <p className="text-sm text-brand-light bg-brand/10 border border-brand/40 rounded p-2 mt-3">{fout}</p>}
          <div className="mt-3 flex justify-end">
            <button onClick={ververs} disabled={bezig} className="text-xs text-ink-muted hover:text-ink underline disabled:opacity-50">
              {bezig ? 'Bezig…' : '↻ Ververs'}
            </button>
          </div>
        </div>
      )}

      {confirm && (() => {
        const cur = huidig(confirm);
        const preset = OVERLAY_PRESETS.find((p) => p.key === cur.overlayPreset);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4" onClick={() => setConfirm(null)}>
            <div className="bg-surface text-ink border border-line rounded-lg shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-display mb-1">Toernooi inplannen</h2>
              <p className="text-sm text-ink-muted mb-4 truncate" title={confirm.name}>{confirm.name}</p>
              <dl className="text-sm space-y-1.5 mb-4">
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Datum</dt><dd>{datumLabel(confirm.date)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Tafels</dt><dd>{cur.tafels.join(', ') || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Start</dt><dd>{tijdVan(confirm.plannedStart)} · stream {cur.preRoll} min eerder</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Eind</dt><dd>{tijdVan(confirm.plannedStop)} of Cuescore “Finished”</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Zichtbaarheid</dt><dd>{VIS_LABELS[cur.visibility]}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Overlays</dt><dd>{preset ? preset.label : '—'}</dd></div>
              </dl>
              <label className="block text-sm mb-4">
                <span className="text-ink-muted">Voorloop (minuten vóór start)</span>
                <input type="number" min="0" value={cur.preRoll}
                       onChange={(e) => wijzig(confirm, { preRoll: Math.max(0, Number(e.target.value) || 0) })}
                       className="w-full bg-canvas border border-line rounded px-3 py-2 mt-1 text-ink" />
              </label>
              {fout && <p className="text-sm text-brand-light bg-brand/10 border border-brand/40 rounded p-2 mb-3">{fout}</p>}
              <div className="flex gap-2">
                <button onClick={() => setConfirm(null)} className="flex-1 border border-line rounded px-3 py-2 text-sm">Terug</button>
                <button onClick={() => plan(confirm)} disabled={bezig || cur.tafels.length === 0}
                        className="flex-1 bg-brand hover:bg-brand-dark text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-50">
                  {bezig ? 'Bezig…' : 'Bevestig plannen'}
                </button>
              </div>
              <p className="text-xs text-ink-muted mt-3">Fase 1: dit legt de planning vast. Automatisch starten/stoppen volgt in fase 2/3 — voor nu start je nog handmatig via “+ Nieuwe stream”.</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
// Agent-status: waarschuwt als de OBS-pc (agent) niet bereikbaar is — dan werkt
// starten/stoppen van streams niet. Online = subtiel groen; offline = duidelijke rode balk.
function AgentStatus({ agent }) {
  if (!agent) return null;
  if (agent.online) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-4">
        <span className="w-2 h-2 rounded-full bg-emerald-400" /> Agent online — OBS-pc bereikbaar
      </div>
    );
  }
  const geleden = agent.secondsAgo != null ? ` (laatst gezien ${agent.secondsAgo}s geleden)` : '';
  return (
    <div className="mb-4 flex items-start gap-2 bg-brand/15 border border-brand/40 text-brand-light rounded-lg px-4 py-3 text-sm">
      <span aria-hidden="true">⚠</span>
      <span><b>Agent offline</b> — de OBS-pc reageert niet{geleden}. Streams starten of stoppen werkt nu niet.
        Controleer of de pc aan staat en de agent draait.</span>
    </div>
  );
}

export default function App() {
  const [ingelogd, setIngelogd] = useState(!!getToken());
  const [tables, setTables] = useState([]);
  const [venueLive, setVenueLive] = useState(null);
  const [agent, setAgent] = useState(null);
  const [status, setStatus] = useState('laden');
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const pushToast = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, message, type }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3500);
  }, []);
  const dismissToast = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));

  const laad = useCallback(async () => {
    try {
      const d = await getLive();
      const list = (d.tables && d.tables.length) ? d.tables : CAMERAS.map((n) => ({ tableNumber: n, status: 'offline' }));
      setTables(list.sort((a, b) => a.tableNumber - b.tableNumber));
      setVenueLive(d.venueLive ?? null);
      setAgent(d.agent ?? null);
      setStatus('ok');
      setLastUpdated(Date.now());
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
    setBusy(true);
    try { await fn(); if (okText) pushToast(okText, 'ok'); await laad(); }
    catch (e) {
      if (e.status === 401) { clearToken(); setIngelogd(false); }
      else pushToast(`Fout: ${e.message}`, 'fout');
    } finally { setBusy(false); }
  }

  // Overlay wijzigen met rollback-ondersteuning: geeft true bij succes, false bij fout
  // (dan draait de tafelkaart de knop terug). Succes is stil — de knop bevestigt zelf;
  // alleen bij een fout een toast.
  async function wijzigOverlay(n, patch) {
    try {
      await setOverlay({ tableNumber: n, ...patch });
      laad(); // reconcile met de server (agent-standen)
      return true;
    } catch (e) {
      if (e.status === 401) { clearToken(); setIngelogd(false); }
      else pushToast(`Kon overlay (tafel ${n}) niet wijzigen: ${e.message}`, 'fout');
      return false;
    }
  }

  if (!ingelogd) return <Login onSaved={() => setIngelogd(true)} />;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="bg-surface-raised text-white px-4 sm:px-6 py-3 shadow-lg border-b border-line grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center">
          <img src="/mokum-logo.png" alt="Mokum Pool & Darts" className="h-10 w-auto" />
        </div>
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-display leading-tight"><span className="text-brand">Mokum</span> Streams</h1>
          <p className="text-ink-muted text-xs sm:text-sm">Plan and manage livestreams</p>
        </div>
        <div className="flex items-center gap-4 justify-end">
          <a href="/uitleg/" target="_blank" rel="noreferrer"
             className="text-ink-muted hover:text-ink text-sm underline whitespace-nowrap">Hoe het werkt</a>
          <button onClick={() => setInfoOpen(true)}
                  className="text-ink-muted hover:text-ink text-sm underline whitespace-nowrap">Uitleg overlays</button>
          <button onClick={() => { clearToken(); setIngelogd(false); }}
                  className="text-ink-muted hover:text-ink text-sm underline">Uitloggen</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <button onClick={() => setWizard(true)}
                  className="bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-2 font-medium shadow-lg">
            + Nieuwe stream
          </button>
          <VerversStatus lastUpdated={lastUpdated} status={status} onRefresh={laad} />
        </div>

        {status === 'ok' && <AgentStatus agent={agent} />}
        {status === 'laden' && <p className="text-ink-muted">Laden…</p>}
        {status === 'fout' && (
          <p className="text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded p-3">
            Kon de status niet laden. Staat <code>VITE_API_BASE</code> goed en draait de backend?
          </p>
        )}
        {status === 'ok' && <Overzicht tables={tables} venueLive={venueLive} />}
        {status === 'ok' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tables.map((t) => (
                <TableCard key={t.tableNumber} table={t} busy={busy}
                  onStop={(n) => actie(() => stopStream(n), `Tafel ${n} gestopt`)}
                  onOverlay={wijzigOverlay}
                  onPreview={(tafel) => setPreview(tafel)}
                />
              ))}
            </div>
            <StreamPaneel tables={tables} />
            <div className="mt-4">
              <ToernooiPlanner onGepland={laad} />
            </div>
          </>
        )}
      </main>

      {wizard && (
        <Wizard onClose={() => setWizard(false)}
                onStarted={() => { setWizard(false); pushToast('Stream gestart — OBS volgt via de agent.', 'ok'); laad(); }} />
      )}
      {infoOpen && <OverlayInfo onClose={() => setInfoOpen(false)} />}
      {preview && <Preview table={preview} onClose={() => setPreview(null)} />}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
