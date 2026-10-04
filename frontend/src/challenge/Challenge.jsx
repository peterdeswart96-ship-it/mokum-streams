import { useState, useEffect, useCallback } from 'react';
import * as api from './api';

// Challenge wizard for Mokum members (#90).
//
// Goal: at the table, on your phone, get a challenge into Cuescore quickly. Four steps, one
// question per screen: Opponent → Game → Table → Review. A favorite is a shortcut: one tap
// fills everything in and jumps to the first step that is still incomplete (the review, if
// nothing is missing). Who breaks is deliberately NOT handled — the lag at the table decides.
// Design: docs/ontwerp/challenge-wizard.html.

const STANDAARD = { discipline: 3, raceTo: 5, breakrule: 'winner', shotclock: null };

const STAPPEN = ['Opponent', 'Game', 'Table', 'Review'];

// The four most played games get a big tile with a ball; the rest sit behind "Other games".
const TEGELS = [
  { id: 3, naam: '9-Ball', bal: 'b9', nr: '9', rand: '#f5c518', vlak: 'linear-gradient(180deg,rgba(245,197,24,.28),rgba(255,255,255,.07))' },
  { id: 2, naam: '8-Ball', bal: 'b8', nr: '8', rand: '#777777', vlak: 'linear-gradient(180deg,rgba(120,120,120,.35),rgba(30,30,30,.4))' },
  { id: 4, naam: '10-Ball', bal: 'b10', nr: '10', rand: '#3b82f6', vlak: 'linear-gradient(180deg,rgba(30,91,216,.35),rgba(255,255,255,.07))' },
  { id: 5, naam: '14.1', bal: 'b141', nr: '14.1', rand: '#2f6df0', vlak: 'linear-gradient(180deg,rgba(23,65,168,.55),rgba(23,65,168,.15))' },
];
const TEGEL_IDS = TEGELS.map((t) => t.id);
const RACES = [3, 5, 7];
const SHOTCLOCKS = [30, 45];

const BAL_STIJL = {
  b9: 'linear-gradient(180deg,#fff 0 22%,#f5c518 22% 78%,#fff 78%)',
  b8: 'radial-gradient(circle at 35% 30%,#555,#1c1c1c 70%)',
  b10: 'linear-gradient(180deg,#fff 0 22%,#1e5bd8 22% 78%,#fff 78%)',
  b141: 'radial-gradient(circle at 35% 30%,#3b82f6,#1741a8 75%)',
};

// Same logo as on the dashboard (public/youtube.png), so it is recognisable in the room.
// No mx-auto in the base: centering belongs on the table button only.
const YouTubeMerk = ({ className = '' }) => (
  <img src="/youtube.png" alt="" aria-hidden="true" className={`h-3 w-auto ${className}`} />
);

// ── Small building blocks ────────────────────────────────────────────────────

function Melding({ soort = 'fout', children }) {
  const kleur = soort === 'fout'
    ? 'border-brand/50 bg-brand/10 text-brand-light'
    : 'border-emerald-600/50 bg-emerald-600/10 text-emerald-300';
  return <p className={`text-sm rounded-xl border px-3 py-2.5 ${kleur}`}>{children}</p>;
}

const Ster = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`w-4 h-4 fill-current ${className}`}>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95L12 2.5z" />
  </svg>
);

const veld = 'w-full bg-canvas border border-line rounded-xl px-3 py-3 text-ink text-base';
const knop = 'rounded-xl border px-3 py-3.5 text-base text-center';
const knopUit = 'border-line bg-surface text-ink';
const knopAan = 'border-brand bg-brand/20 text-ink';

function Bal({ soort, nr }) {
  return (
    <span className="relative flex items-center justify-center w-11 h-11 rounded-full shrink-0"
          style={{ background: BAL_STIJL[soort], boxShadow: 'inset -5px -6px 10px rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.5)' }}>
      <span className="flex items-center justify-center w-[1.375rem] h-[1.375rem] rounded-full bg-white text-[#111] font-bold"
            style={{ fontSize: nr.length > 2 ? '0.5625rem' : '0.75rem' }}>{nr}</span>
    </span>
  );
}

// Progress bar: the current step is bold, finished steps are filled in.
function Voortgang({ stap }) {
  return (
    <div className="flex gap-1.5 pt-4">
      {STAPPEN.map((naam, i) => (
        <div key={naam} className="flex-1">
          <div className={`h-1 rounded-full ${i <= stap ? 'bg-brand' : 'bg-surface-raised'}`} />
          <small className={`block mt-1.5 text-[0.625rem] ${i === stap ? 'text-ink font-bold' : 'text-ink-muted/70'}`}>{naam}</small>
        </div>
      ))}
    </div>
  );
}

const Titel = ({ children }) => <h2 className="font-display text-2xl mt-5 mb-3">{children}</h2>;
const Label = ({ children }) => <p className="text-xs text-ink-muted mt-5 mb-2">{children}</p>;

// Opens/closes a coloured tile. Used for "Other games", the shot clock and the favorites.
function KleurTegel({ open, onToggle, stijl, className = '', children }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
            className={`w-full rounded-xl border px-4 py-4 font-bold text-base flex items-center justify-center gap-2.5 ${className}`}
            style={stijl}>
      {children}
      <span className="font-normal text-sm">{open ? '▴' : '▾'}</span>
    </button>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────

function Inloggen({ onKlaar }) {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  async function verstuur(e) {
    e.preventDefault();
    setBezig(true); setFout('');
    try {
      const r = await api.login(email.trim(), wachtwoord);
      api.setToken(r.token);
      onKlaar();
    } catch (err) {
      setFout(err.message);
      setBezig(false);
    }
  }

  return (
    <form onSubmit={verstuur} className="space-y-3">
      <p className="text-sm text-ink-muted">
        Log in with your <strong className="text-ink">Cuescore</strong> details — the same ones you
        use on cuescore.com. You only have to do this once.
      </p>

      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
             placeholder="Email address" autoComplete="username" required className={veld} />
      <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)}
             placeholder="Cuescore password" autoComplete="current-password" required className={veld} />

      {fout && <Melding>{fout}</Melding>}

      <button type="submit" disabled={bezig || !email || !wachtwoord}
              className="w-full bg-brand hover:bg-brand-dark text-white rounded-xl px-4 py-3.5 font-bold text-base disabled:opacity-40">
        {bezig ? 'Logging in…' : 'Connect to Cuescore'}
      </button>

      {/* Be honest about what happens with the password — it is not ours, it is Cuescore's,
          and there must be no misunderstanding about that. */}
      <details className="text-xs text-ink-muted pt-2">
        <summary className="cursor-pointer">What happens with my password?</summary>
        <div className="pt-2 space-y-2">
          <p>
            Your password is stored encrypted, so we can create a challenge on your behalf without
            you having to log in every time. Cuescore has no way to give an app limited access, so
            this is the only way this can work.
          </p>
          <p>
            That also means: anyone who gets access to our storage can get into your Cuescore
            account. If you don't want that, don't use this page and create your challenges in
            Cuescore itself.
          </p>
          <p>
            You can disconnect at any time; your password is then deleted. If you change your
            password at Cuescore, our copy is worthless immediately.
          </p>
        </div>
      </details>
    </form>
  );
}

// ── Choosing an opponent ─────────────────────────────────────────────────────

function SpelerRij({ s, gekozen, onKies }) {
  const info = [s.land, s.club, s.plaats].filter(Boolean);
  return (
    <button onClick={() => onKies(s)}
            className={`w-full flex items-center gap-3 text-left rounded-xl border px-3 py-2.5 mt-2 ${
              gekozen ? knopAan : 'border-line hover:border-ink-muted'}`}>
      {s.foto
        ? <img src={s.foto} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-surface" />
        : <span className="w-9 h-9 rounded-full bg-surface-raised shrink-0" />}
      <span className="min-w-0">
        <span className="block truncate font-bold">{s.naam}</span>
        {/* The id as well, so you can check you have the right one of thirteen namesakes
            before the challenge is created. */}
        <span className="block text-[0.6875rem] text-ink-muted truncate">
          {info.join(' · ')}{info.length ? ' · ' : ''}#{s.playerId}
        </span>
      </span>
    </button>
  );
}

function ZoekSpeler({ onKies }) {
  const [q, setQ] = useState('');
  const [spelers, setSpelers] = useState([]);
  const [bezig, setBezig] = useState(false);

  // Wait until you stop typing — otherwise every keystroke fires a request that goes via
  // our backend to Cuescore.
  useEffect(() => {
    if (q.trim().length < 2) { setSpelers([]); return; }
    setBezig(true);
    const t = setTimeout(async () => {
      try { setSpelers((await api.zoekSpelers(q.trim())).spelers || []); }
      catch { setSpelers([]); }
      finally { setBezig(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search by name…" className={veld} />
      {bezig && <p className="text-xs text-ink-muted mt-2">searching…</p>}
      {spelers.map((s) => <SpelerRij key={s.playerId} s={s} onKies={onKies} />)}
      {!bezig && q.trim().length >= 2 && !spelers.length && (
        <p className="text-xs text-ink-muted mt-2">Nobody found. Check the spelling in Cuescore.</p>
      )}
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function Challenge() {
  const [status, setStatus] = useState(api.getToken() ? 'laden' : 'uitgelogd');
  const [lid, setLid] = useState(null);
  const [keuzes, setKeuzes] = useState({ tafels: [], cameraTafels: [], disciplines: [], breakregels: [], maxRace: 200 });

  const [stap, setStap] = useState(0);
  const [spel, setSpel] = useState(STANDAARD);
  const [tegenstander, setTegenstander] = useState(null);
  const [tafel, setTafel] = useState(null);

  // Little pieces of interface state.
  const [zoeken, setZoeken] = useState(false);
  const [openFav, setOpenFav] = useState(false);
  const [openOverig, setOpenOverig] = useState(false);
  const [openShot, setOpenShot] = useState(false);
  const [raceAnders, setRaceAnders] = useState(false);
  const [shotAnders, setShotAnders] = useState(false);
  const [bewerken, setBewerken] = useState(false);
  const [bewaard, setBewaard] = useState(false);
  const [beheer, setBeheer] = useState(false);

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [klaar, setKlaar] = useState(null); // { challengeId, url, shotclock }

  const laad = useCallback(async () => {
    try {
      const d = await api.getMe();
      setLid(d.lid);
      setKeuzes({
        tafels: d.alleTafels || [],
        cameraTafels: d.tafels || [],
        disciplines: d.disciplines || [],
        breakregels: d.breakregels || [],
        maxRace: d.maxRace || 200,
      });
      setStatus('ok');
    } catch (e) {
      if (e.opnieuwInloggen || e.status === 401) { api.clearToken(); setStatus('uitgelogd'); }
      else { setFout(e.message); setStatus('ok'); }
    }
  }, []);

  useEffect(() => { if (status === 'laden') laad(); }, [status, laad]);

  const favorieten = (lid && lid.sjablonen) || [];
  const recent = (lid && lid.recent) || [];
  const spelNaam = (d) => (TEGELS.find((t) => t.id === Number(d)) || keuzes.disciplines.find((x) => x.id === Number(d)) || {}).naam || `game ${d}`;
  const overige = keuzes.disciplines.filter((d) => !TEGEL_IDS.includes(d.id));
  const raceTo = Number(spel.raceTo);
  const raceGeldig = Number.isInteger(raceTo) && raceTo >= 1 && raceTo <= keuzes.maxRace;

  function ga(naar) {
    setStap(naar); setFout('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Which step is the first one that still lacks something? Review if everything is there.
  const eersteOpen = () => (!tegenstander ? 0 : !raceGeldig ? 1 : !tafel ? 2 : 3);

  // Tapping a favorite fills everything in. The list is below the fold, so go straight to
  // the first incomplete step — otherwise you tap something and nothing seems to happen.
  function kiesFavoriet(f) {
    const nieuw = {
      discipline: f.discipline, raceTo: f.raceTo, breakrule: f.breakrule, shotclock: f.shotclock || null,
    };
    setSpel(nieuw);
    setRaceAnders(!RACES.includes(Number(f.raceTo)));
    setShotAnders(!!f.shotclock && !SHOTCLOCKS.includes(f.shotclock));
    setOpenOverig(!TEGEL_IDS.includes(Number(f.discipline)));
    setOpenShot(!!f.shotclock);
    setTegenstander(f.tegenstanderId ? { playerId: f.tegenstanderId, naam: f.tegenstanderNaam || 'opponent' } : null);
    setTafel(f.tafel || null);
    setBewaard(false);
    const open = !f.tegenstanderId ? 0 : !f.tafel ? 2 : 3;
    ga(open);
  }

  async function bewaarFavorieten(nieuw) {
    const r = await api.bewaarSjablonen(nieuw);
    setLid({ ...lid, sjablonen: r.sjablonen });
    return r.sjablonen;
  }

  // The name the page suggests: everything that defines the challenge, in readable order.
  // "Lennert Duyn, race to 5, 9-Ball, table 1".
  function voorgesteldeNaam() {
    const delen = [];
    if (tegenstander) delen.push(tegenstander.naam);
    delen.push(`race to ${spel.raceTo}`);
    delen.push(spelNaam(spel.discipline));
    if (spel.breakrule === 'alternate') delen.push('alternate break'); // winner break is the default
    if (spel.shotclock) delen.push(`${spel.shotclock}s shot clock`);
    if (tafel) delen.push(`table ${tafel}`);
    return delen.join(', ');
  }

  async function bewaarAlsFavoriet() {
    try {
      await bewaarFavorieten([...favorieten, {
        naam: voorgesteldeNaam(),
        discipline: spel.discipline, raceTo: spel.raceTo, breakrule: spel.breakrule,
        ...(spel.shotclock ? { shotclock: spel.shotclock } : {}),
        ...(tegenstander ? { tegenstanderId: tegenstander.playerId, tegenstanderNaam: tegenstander.naam } : {}),
        ...(tafel ? { tafel } : {}),
      }]);
      setBewaard(true);
    } catch (e) { setFout(e.message); }
  }

  async function aanmaken() {
    setBezig(true); setFout('');
    try {
      const r = await api.maakChallenge({
        tegenstanderId: tegenstander.playerId,
        tegenstander: {
          naam: tegenstander.naam, foto: tegenstander.foto, land: tegenstander.land,
          club: tegenstander.club, plaats: tegenstander.plaats,
        },
        tafel,
        discipline: spel.discipline, raceTo: spel.raceTo, breakrule: spel.breakrule,
        ...(spel.shotclock ? { shotclock: spel.shotclock } : {}),
      });
      setKlaar(r);
      if (r.recent) setLid((l) => ({ ...l, recent: r.recent }));
    } catch (e) {
      if (e.opnieuwInloggen) { api.clearToken(); setStatus('uitgelogd'); }
      else setFout(e.message);
    } finally { setBezig(false); }
  }

  async function verbreek() {
    if (!window.confirm('Disconnect? Your stored password will be deleted.')) return;
    try { await api.loskoppelen(); } catch { /* gone is gone, even if it was already gone */ }
    api.clearToken();
    setStatus('uitgelogd');
  }

  function opnieuw() {
    setKlaar(null); setTafel(null); setTegenstander(null); setFout(''); setBewaard(false);
    setZoeken(false); setOpenFav(false); setStap(0);
    window.scrollTo({ top: 0 });
  }

  // What may you do on this step?
  const mag = [!!tegenstander, raceGeldig, !!tafel, !!tegenstander && !!tafel && raceGeldig && !bezig][stap];

  // ── Steps ──────────────────────────────────────────────────────────────────

  const stapOpponent = (
    <>
      <Titel>Who are you playing?</Titel>

      {recent.length > 0 && (
        <>
          <Label>Recently played against</Label>
          {recent.map((s) => (
            <SpelerRij key={s.playerId} s={s} gekozen={tegenstander && tegenstander.playerId === s.playerId}
                       onKies={(x) => { setTegenstander(x); setZoeken(false); }} />
          ))}
        </>
      )}

      {tegenstander && !recent.some((s) => s.playerId === tegenstander.playerId) && (
        <>
          <Label>Selected</Label>
          <SpelerRij s={tegenstander} gekozen onKies={() => {}} />
        </>
      )}

      <button onClick={() => setZoeken(!zoeken)}
              className={`${knop} ${knopUit} w-full text-left mt-3 flex items-center gap-2`}>
        <span aria-hidden="true">🔍</span> Search playername
      </button>
      {zoeken && <ZoekSpeler onKies={(x) => { setTegenstander(x); setZoeken(false); }} />}

      {favorieten.length > 0 && (
        <div className="mt-3">
          <KleurTegel open={openFav} onToggle={() => setOpenFav(!openFav)}
                      className="border-[#22a559] text-white"
                      stijl={{ background: 'linear-gradient(180deg,#1d7a45,#145c33)' }}>
            <Ster className="w-[1.375rem] h-[1.375rem] text-[#f5c518]" /> Favorites
          </KleurTegel>
          {openFav && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[0.6875rem] text-ink-muted">Tap a favorite to fill everything in.</p>
                <button onClick={() => setBewerken(!bewerken)} className="text-xs text-ink-muted underline shrink-0 ml-2">
                  {bewerken ? 'done' : 'edit'}
                </button>
              </div>
              <div className="space-y-2">
                {favorieten.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button onClick={() => kiesFavoriet(f)}
                            className="flex-1 text-left rounded-xl border border-line bg-surface px-4 py-3 hover:border-ink-muted flex items-center gap-3">
                      <Ster className="text-[#f5c518] shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-bold truncate">{f.naam}</span>
                        <span className="block text-xs text-ink-muted">
                          {spelNaam(f.discipline)} · race to {f.raceTo} ·{' '}
                          {f.breakrule === 'winner' ? 'winner break' : 'alternate break'}
                          {f.shotclock ? ` · ${f.shotclock}s shot clock` : ''}
                          {f.tafel ? ` · table ${f.tafel}` : ''}
                        </span>
                      </span>
                    </button>
                    {bewerken && (
                      <button onClick={() => bewaarFavorieten(favorieten.filter((_, j) => j !== i))}
                              className="text-xs text-brand-light underline shrink-0">delete</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const stapGame = (
    <>
      <Titel>What are you playing?</Titel>
      <div className="grid grid-cols-2 gap-2.5">
        {TEGELS.map((t) => {
          const aan = Number(spel.discipline) === t.id;
          return (
            <button key={t.id} onClick={() => setSpel({ ...spel, discipline: t.id })}
                    className="rounded-xl border px-2 py-5 flex flex-col items-center gap-2.5 font-bold text-lg"
                    style={aan ? { borderColor: t.rand, background: t.vlak } : { borderColor: '#2a2a2a', background: '#1a1a1a' }}>
              <Bal soort={t.bal} nr={t.nr} />
              {t.naam}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5">
        <KleurTegel open={openOverig} onToggle={() => setOpenOverig(!openOverig)}
                    className="border-[#f08a1c] text-white"
                    stijl={{ background: 'linear-gradient(180deg,#f59a2b,#d9700a)' }}>
          Other games
        </KleurTegel>
        {openOverig && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {overige.map((d) => (
              <button key={d.id} onClick={() => setSpel({ ...spel, discipline: d.id })}
                      className={`${knop} text-sm ${Number(spel.discipline) === d.id ? knopAan : knopUit}`}>
                {d.naam}
              </button>
            ))}
          </div>
        )}
      </div>

      <Label>Race to</Label>
      <div className="flex gap-2">
        {RACES.map((n) => (
          <button key={n} onClick={() => { setSpel({ ...spel, raceTo: n }); setRaceAnders(false); }}
                  className={`flex-1 ${knop} ${!raceAnders && raceTo === n ? knopAan : knopUit}`}>{n}</button>
        ))}
        <button onClick={() => setRaceAnders(true)}
                className={`flex-1 ${knop} ${raceAnders ? knopAan : knopUit}`}>Other</button>
      </div>
      {raceAnders && (
        <input type="number" inputMode="numeric" min="1" max={keuzes.maxRace} value={spel.raceTo}
               onChange={(e) => setSpel({ ...spel, raceTo: e.target.value })}
               placeholder="Race to…" className={`${veld} mt-2`} />
      )}

      <Label>Break</Label>
      <div className="flex gap-2">
        {keuzes.breakregels.map((b) => (
          <button key={b.id} onClick={() => setSpel({ ...spel, breakrule: b.id })}
                  className={`flex-1 ${knop} ${spel.breakrule === b.id ? knopAan : knopUit}`}>{b.naam}</button>
        ))}
      </div>

      {/* Shot clock is optional, so it is folded away; the tile shows what is chosen. */}
      <div className="mt-5">
        <KleurTegel open={openShot} onToggle={() => setOpenShot(!openShot)}
                    className="border-[#c9a27a] text-[#3a2410]"
                    stijl={{ background: 'linear-gradient(180deg,#e3c9a8,#c9a27a)' }}>
          <span className="text-3xl leading-none" aria-hidden="true">⏱️</span>
          <span>Shot clock <span className="font-normal opacity-80">{spel.shotclock ? `— ${spel.shotclock} s` : '(optional)'}</span></span>
        </KleurTegel>
        {openShot && (
          <div className="rounded-b-xl border border-t-0 border-[#c9a27a] bg-[#c9a27a]/10 p-3 -mt-1">
            <div className="flex gap-2">
              <button onClick={() => { setSpel({ ...spel, shotclock: null }); setShotAnders(false); }}
                      className={`flex-1 ${knop} ${!spel.shotclock && !shotAnders ? knopAan : knopUit}`}>Off</button>
              {SHOTCLOCKS.map((n) => (
                <button key={n} onClick={() => { setSpel({ ...spel, shotclock: n }); setShotAnders(false); }}
                        className={`flex-1 ${knop} ${!shotAnders && spel.shotclock === n ? knopAan : knopUit}`}>{n} s</button>
              ))}
              <button onClick={() => setShotAnders(true)}
                      className={`flex-1 ${knop} ${shotAnders ? knopAan : knopUit}`}>Other</button>
            </div>
            {shotAnders && (
              <input type="number" inputMode="numeric" min="5" max="300" value={spel.shotclock || ''}
                     onChange={(e) => setSpel({ ...spel, shotclock: e.target.value ? Number(e.target.value) : null })}
                     placeholder="Seconds…" className={`${veld} mt-2`} />
            )}
            <p className="text-xs text-ink-muted mt-2.5">The clock is set on the scoreboard for this match.</p>
          </div>
        )}
      </div>
    </>
  );

  const stapTable = (
    <>
      <Titel>Which table?</Titel>
      <div className="grid grid-cols-4 gap-2">
        {keuzes.tafels.map((n) => (
          <button key={n} onClick={() => setTafel(n)}
                  className={`${knop} font-bold ${tafel === n ? knopAan : knopUit}`}>
            {n}
            {keuzes.cameraTafels.includes(n) && <YouTubeMerk className="mx-auto mt-1" />}
          </button>
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-muted mt-4">
        <YouTubeMerk /> stream table
      </p>
    </>
  );

  const Regel = ({ naam, waarde, naar }) => (
    <button onClick={() => ga(naar)} className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 border-b border-line last:border-0">
      <span className="min-w-0">
        <span className="block text-xs text-ink-muted">{naam}</span>
        <span className="block truncate">{waarde}</span>
      </span>
      <span className="text-xs text-brand-light underline shrink-0">change</span>
    </button>
  );

  const breakNaam = (keuzes.breakregels.find((b) => b.id === spel.breakrule) || {}).naam || spel.breakrule;
  const stapReview = (
    <>
      <Titel>Is this right?</Titel>
      <p className="text-sm text-ink-muted -mt-1 mb-3">Tap a line to change it.</p>
      <div className="rounded-xl border border-line bg-surface">
        <Regel naam="Opponent" waarde={tegenstander ? tegenstander.naam : '—'} naar={0} />
        <Regel naam="Game" waarde={`${spelNaam(spel.discipline)} · race to ${spel.raceTo}`} naar={1} />
        <Regel naam="Break" waarde={breakNaam} naar={1} />
        {spel.shotclock && <Regel naam="Shot clock" waarde={`${spel.shotclock} s`} naar={1} />}
        <Regel naam="Table" waarde={tafel || '—'} naar={2} />
      </div>

      {/* Saving works without a table too: a favorite is about the match, not where you play. */}
      <button onClick={bewaarAlsFavoriet} disabled={bewaard}
              className="w-full mt-5 rounded-xl border border-[#22a559] px-4 py-4 font-bold text-base text-white flex items-center justify-center gap-2.5 disabled:opacity-80"
              style={{ background: 'linear-gradient(180deg,#1d7a45,#145c33)' }}>
        <Ster className="w-[1.375rem] h-[1.375rem] text-[#f5c518]" />
        {bewaard ? 'Saved as favorite' : 'Save as favorite'}
      </button>
    </>
  );

  const stappen = [stapOpponent, stapGame, stapTable, stapReview];

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* The header belongs in the same column as the rest — otherwise it sticks to the top
          left corner on a wide screen while the content floats in the middle. */}
      <header className="border-b border-line">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-xl font-display"><span className="text-brand">Mokum</span> Challenge</h1>
          <p className="text-xs text-ink-muted">Quickly create a challenge in Cuescore</p>
          {status === 'ok' && !klaar && <Voortgang stap={stap} />}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-16">
        {status === 'laden' && <p className="text-sm text-ink-muted mt-8">Loading…</p>}

        {status === 'uitgelogd' && <div className="mt-6"><Inloggen onKlaar={() => setStatus('laden')} /></div>}

        {status === 'ok' && klaar && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-600/50 bg-emerald-600/10 text-emerald-300 px-3 py-3">
              <span className="w-7 h-7 rounded-full bg-[#22a559] text-white flex items-center justify-center shrink-0" aria-hidden="true">✓</span>
              <span>Challenge created. <span aria-hidden="true">😀</span></span>
            </div>
            <p className="text-sm text-ink-muted">
              <span aria-hidden="true">📱</span> <strong className="text-ink">Turn on the iPad at table {tafel}.</strong>{' '}
              The challenge scoreboard will show up there.
            </p>
            <p className="text-sm text-ink-muted">Then do the lag and press START on the scoreboard.</p>
            {klaar.shotclock === false && (
              <Melding>
                The shot clock could not be set. Set it on the iPad: ⋮ menu → Shotclock settings.
              </Melding>
            )}
            <a href={klaar.url} target="_blank" rel="noreferrer"
               className="flex items-center justify-center gap-2.5 rounded-xl border border-[#d0d0d0] px-4 py-3.5 font-bold text-[#222]"
               style={{ background: 'linear-gradient(180deg,#f0f0f0,#d8d8d8)' }}>
              <img src="/cuescore-logo.png" alt="" className="w-[1.625rem] h-[1.625rem] rounded-md" />
              Open in Cuescore ↗
            </a>
            <button onClick={opnieuw}
                    className="w-full bg-brand hover:bg-brand-dark text-white rounded-xl px-4 py-3.5 font-bold">
              Another challenge
            </button>
          </div>
        )}

        {status === 'ok' && !klaar && (
          <>
            {stappen[stap]}

            {fout && <div className="mt-4"><Melding>{fout}</Melding></div>}

            <div className="flex gap-2.5 mt-8">
              {stap > 0 && (
                <button onClick={() => ga(stap - 1)}
                        className="flex-none w-24 rounded-xl border border-line text-ink-muted py-4 text-base">Back</button>
              )}
              {stap < 3 ? (
                <button disabled={!mag} onClick={() => ga(stap + 1)}
                        className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-xl py-4 font-bold text-base disabled:opacity-35">
                  Next
                </button>
              ) : (
                <button disabled={!mag} onClick={aanmaken}
                        className="flex-1 bg-brand hover:bg-brand-dark text-white rounded-xl py-4 font-bold text-base disabled:opacity-35">
                  {bezig ? 'Creating…' : 'Create challenge'}
                </button>
              )}
            </div>

            <div className="mt-10 border-t border-line pt-4 text-xs text-ink-muted">
              <button onClick={() => setBeheer(!beheer)} className="underline">
                {beheer ? 'Hide' : 'Show'} settings
              </button>
              {beheer && (
                <div className="mt-3 space-y-3">
                  <p>Logged in as <span className="text-ink">{lid && lid.email}</span></p>
                  <button onClick={verbreek} className="underline text-brand-light">
                    Disconnect and delete password
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
