import { useState, useEffect, useCallback } from 'react';
import * as api from './api';

// Challenge-pagina voor Mokum-leden (#90).
//
// Doel: aan de tafel, op je telefoon, snel een challenge in Cuescore hebben. Twee wegen:
// een favoriet aantikken (alles staat meteen goed), of zelf samenstellen. Wie mag beginnen
// wordt bewust NIET geregeld — dat bepaalt de lag aan de tafel.

const STANDAARD = { discipline: 3, raceTo: 5, breakrule: 'winner' };

// Merkje op de tafels die gefilmd worden. Hetzelfde logo als op het dashboard
// (public/youtube.png), zodat het in de zaal herkenbaar hetzelfde ding is.
// Geen mx-auto in de basis: het centreren hoort alleen op de tafelknop thuis, en in de
// legenda zou het de tekst wegduwen (Tailwind laat mx-auto van mx-0 winnen).
const YouTubeMerk = ({ className = '' }) => (
  <img src="/youtube.png" alt="" aria-hidden="true"
       className={`h-3 w-auto ${className}`} />
);

// ── Kleine bouwstenen ────────────────────────────────────────────────────────

function Melding({ soort = 'fout', children }) {
  const kleur = soort === 'fout'
    ? 'border-brand/50 bg-brand/10 text-brand-light'
    : 'border-emerald-600/50 bg-emerald-600/10 text-emerald-300';
  return <p className={`text-sm rounded-lg border px-3 py-2 ${kleur}`}>{children}</p>;
}

const Kop = ({ children }) => (
  <h2 className="text-sm font-medium text-ink-muted mb-2 mt-6">{children}</h2>
);

const Ster = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`w-4 h-4 fill-current ${className}`}>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95L12 2.5z" />
  </svg>
);

const veld = 'w-full bg-canvas border border-line rounded-lg px-3 py-2.5 text-ink text-base';

// Uitklapbaar onderdeel. De kop is zelf de knop — op een telefoon wil je een groot
// trefvlak, geen klein pijltje. Standaard staan beide panelen open: inklappen is er om
// ruimte te maken als je het niet nodig hebt, niet om dingen te verstoppen.
function Paneel({ titel, icoon, open, onToggle, rand = 'border-line', children }) {
  return (
    <section className={`mt-6 rounded-lg border-2 ${rand}`}>
      <button onClick={onToggle} aria-expanded={open}
              className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left">
        <span className="text-sm font-medium flex items-center gap-1.5">{icoon}{titel}</span>
        <span className={`text-ink-muted text-xs transition-transform ${open ? '' : '-rotate-90'}`}>▼</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

// ── Inloggen ─────────────────────────────────────────────────────────────────

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
        Log in met je <strong className="text-ink">Cuescore</strong>-gegevens — dezelfde als
        waarmee je op cuescore.com inlogt. Dit hoef je maar één keer te doen.
      </p>

      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
             placeholder="E-mailadres" autoComplete="username" required className={veld} />
      <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)}
             placeholder="Cuescore-wachtwoord" autoComplete="current-password" required className={veld} />

      {fout && <Melding>{fout}</Melding>}

      <button type="submit" disabled={bezig || !email || !wachtwoord}
              className="w-full bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-3 font-medium text-base disabled:opacity-40">
        {bezig ? 'Bezig met inloggen…' : 'Koppelen met Cuescore'}
      </button>

      {/* Eerlijk zijn over wat er met het wachtwoord gebeurt — dit is niet ons wachtwoord,
          het is dat van Cuescore, en daar mag geen misverstand over bestaan. */}
      <details className="text-xs text-ink-muted pt-2">
        <summary className="cursor-pointer">Wat gebeurt er met mijn wachtwoord?</summary>
        <div className="pt-2 space-y-2">
          <p>
            Je wachtwoord wordt versleuteld opgeslagen, zodat wij namens jou een challenge kunnen
            aanmaken zonder dat je elke keer opnieuw hoeft in te loggen. Cuescore heeft geen manier
            om een app beperkte toegang te geven, dus dit is de enige manier waarop dit kan werken.
          </p>
          <p>
            Dat betekent ook: wie toegang krijgt tot onze opslag, kan bij je Cuescore-account. Wil je
            dat niet, gebruik deze pagina dan niet en maak je challenges gewoon in Cuescore zelf.
          </p>
          <p>
            Je kunt de koppeling altijd verbreken; dan wordt je wachtwoord gewist. Wijzig je je
            wachtwoord bij Cuescore, dan is onze kopie meteen waardeloos.
          </p>
        </div>
      </details>
    </form>
  );
}

// ── Tegenstander zoeken ──────────────────────────────────────────────────────

function ZoekTegenstander({ gekozen, onKies }) {
  const [q, setQ] = useState('');
  const [spelers, setSpelers] = useState([]);
  const [bezig, setBezig] = useState(false);

  // Even wachten met zoeken tot je uitgetypt bent — anders vuurt elke toetsaanslag een
  // aanvraag af die via onze backend naar Cuescore gaat.
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

  if (gekozen) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-brand bg-brand/15 px-4 py-2.5">
        <span>{gekozen.naam}</span>
        <button onClick={() => onKies(null)} className="text-sm text-ink-muted underline">wijzig</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam…" className={veld} />
      {bezig && <p className="text-xs text-ink-muted">zoeken…</p>}
      {spelers.map((s) => (
        <button key={s.playerId} onClick={() => onKies({ playerId: s.playerId, naam: s.naam })}
                className="w-full text-left rounded-lg border border-line px-4 py-2.5 hover:border-ink-muted">
          {s.naam}
        </button>
      ))}
      {!bezig && q.trim().length >= 2 && !spelers.length && (
        <p className="text-xs text-ink-muted">Niemand gevonden. Let op de schrijfwijze in Cuescore.</p>
      )}
    </div>
  );
}

// ── Hoofdscherm ──────────────────────────────────────────────────────────────

export default function Challenge() {
  const [status, setStatus] = useState(api.getToken() ? 'laden' : 'uitgelogd');
  const [lid, setLid] = useState(null);
  const [keuzes, setKeuzes] = useState({ tafels: [], cameraTafels: [], disciplines: [], breakregels: [], maxRace: 200 });

  // De challenge die je nu samenstelt.
  const [spel, setSpel] = useState(STANDAARD);
  const [tegenstander, setTegenstander] = useState(null);
  const [tafel, setTafel] = useState(null);

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [klaar, setKlaar] = useState(null);      // { challengeId, url }
  const [bewaarNaam, setBewaarNaam] = useState(null); // null = het invulveld staat dicht
  const [bewerken, setBewerken] = useState(false);
  const [beheer, setBeheer] = useState(false);
  const [openNieuw, setOpenNieuw] = useState(true);
  const [openFav, setOpenFav] = useState(true);

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
  const spelNaam = (d) => (keuzes.disciplines.find((x) => x.id === Number(d)) || {}).naam || `spel ${d}`;

  // Een favoriet aantikken vult alles in één klap in. De lijst staat onderaan, dus daarna
  // terug naar boven — anders tik je iets aan en lijkt er niets te gebeuren.
  function kiesFavoriet(f) {
    setSpel({ discipline: f.discipline, raceTo: f.raceTo, breakrule: f.breakrule });
    if (f.tegenstanderId) setTegenstander({ playerId: f.tegenstanderId, naam: f.tegenstanderNaam || 'tegenstander' });
    setFout('');
    setOpenNieuw(true); // stond het formulier dichtgeklapt, dan nu open
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function bewaarFavorieten(nieuw) {
    const r = await api.bewaarSjablonen(nieuw);
    setLid({ ...lid, sjablonen: r.sjablonen });
    return r.sjablonen;
  }

  async function bewaarAlsFavoriet() {
    const naam = (bewaarNaam || '').trim() || (tegenstander ? tegenstander.naam : `${spelNaam(spel.discipline)} race ${spel.raceTo}`);
    try {
      await bewaarFavorieten([...favorieten, {
        naam, ...spel,
        ...(tegenstander ? { tegenstanderId: tegenstander.playerId, tegenstanderNaam: tegenstander.naam } : {}),
      }]);
      setBewaarNaam(null);
    } catch (e) { setFout(e.message); }
  }

  async function aanmaken() {
    setBezig(true); setFout('');
    try {
      setKlaar(await api.maakChallenge({ tegenstanderId: tegenstander.playerId, tafel, ...spel }));
    } catch (e) {
      if (e.opnieuwInloggen) { api.clearToken(); setStatus('uitgelogd'); }
      else setFout(e.message);
    } finally { setBezig(false); }
  }

  async function verbreek() {
    if (!window.confirm('Koppeling verbreken? Je opgeslagen wachtwoord wordt gewist.')) return;
    try { await api.loskoppelen(); } catch { /* weg is weg, ook als het al weg was */ }
    api.clearToken();
    setStatus('uitgelogd');
  }

  function opnieuw() { setKlaar(null); setTafel(null); setFout(''); }

  const magAanmaken = tegenstander && tafel && !bezig;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* De kop hoort in dezelfde kolom als de rest — anders plakt hij op een breed scherm
          linksboven in de hoek terwijl de inhoud in het midden zweeft. */}
      <header className="border-b border-line">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-xl font-display"><span className="text-brand">Mokum</span> Challenge</h1>
          <p className="text-xs text-ink-muted">Snel een challenge aanmaken in Cuescore</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-16">
        {status === 'laden' && <p className="text-sm text-ink-muted mt-8">Laden…</p>}

        {status === 'uitgelogd' && <div className="mt-6"><Inloggen onKlaar={() => setStatus('laden')} /></div>}

        {status === 'ok' && klaar && (
          <div className="mt-8 space-y-4">
            <Melding soort="ok">Challenge aangemaakt.</Melding>
            <p className="text-sm text-ink-muted">
              Hij staat klaar in Cuescore. Doe de lag en druk op het scorebord op START.
            </p>
            <a href={klaar.url} target="_blank" rel="noreferrer"
               className="block text-center rounded-lg border border-line px-4 py-3 underline">
              Openen in Cuescore ↗
            </a>
            <button onClick={opnieuw}
                    className="w-full bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-3 font-medium">
              Nog een challenge
            </button>
          </div>
        )}

        {status === 'ok' && !klaar && (
          <>
            {/* ── Nieuwe challenge aanmaken ────────────────────────────────── */}
            <Paneel titel="Nieuwe challenge aanmaken" open={openNieuw} onToggle={() => setOpenNieuw(!openNieuw)}>
            <Kop>Wat spelen jullie?</Kop>
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-ink-muted">Speltype</span>
                <select value={spel.discipline} className={veld}
                        onChange={(e) => setSpel({ ...spel, discipline: Number(e.target.value) })}>
                  {keuzes.disciplines.map((d) => <option key={d.id} value={d.id}>{d.naam}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-ink-muted">Race naar</span>
                <input type="number" min="1" max={keuzes.maxRace} value={spel.raceTo} className={veld}
                       onChange={(e) => setSpel({ ...spel, raceTo: e.target.value })} />
              </label>

              <div>
                <span className="text-xs text-ink-muted">Break format</span>
                <div className="flex gap-2 mt-1">
                  {keuzes.breakregels.map((b) => (
                    <button key={b.id} onClick={() => setSpel({ ...spel, breakrule: b.id })}
                      className={`flex-1 rounded-lg border px-2 py-2.5 text-sm ${
                        spel.breakrule === b.id ? 'border-brand bg-brand/15 text-ink' : 'border-line text-ink-muted'
                      }`}>
                      {b.naam}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Kop>Tegen wie?</Kop>
            <ZoekTegenstander gekozen={tegenstander} onKies={setTegenstander} />

            <Kop>Welke tafel?</Kop>
            <div className="grid grid-cols-5 gap-2">
              {keuzes.tafels.map((n) => (
                <button key={n} onClick={() => setTafel(n)}
                  className={`rounded-lg border py-3 text-base ${
                    tafel === n ? 'border-brand bg-brand/15' : 'border-line text-ink-muted'
                  }`}>
                  {n}
                  {keuzes.cameraTafels.includes(n) && <YouTubeMerk className="mx-auto mt-0.5" />}
                </button>
              ))}
            </div>
            {/* Uitleg over de cameratafels. Bewust hier en niet ergens onder een 'meer
                info'-knop: als je een tafel met camera kiest, moet je nú weten dat starten
                én stoppen via de bar gaat. */}
            <div className="mt-3 rounded-lg border border-line px-3 py-2.5 text-[11px] text-ink-muted space-y-2">
              <p className="flex items-center gap-1.5">
                <YouTubeMerk /> = Deze tafel kan gestreamd worden.
              </p>
              <p>
                Vraag aan de bar of er een stream gestart kan worden. Het stoppen van de stream
                gaat niet vanzelf — vraag ook aan de bar of de stream weer gestopt kan worden.
              </p>
              <p>
                Als de stream gestopt wordt, krijgt hij automatisch een challenge-thumbnail met
                jullie namen erbij. Je kunt hem dan makkelijk terugvinden op ons YouTube-kanaal.
              </p>
            </div>

            {fout && <div className="mt-4"><Melding>{fout}</Melding></div>}

            <button disabled={!magAanmaken} onClick={aanmaken}
                    className="w-full mt-6 bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-4 font-medium text-base disabled:opacity-40">
              {bezig ? 'Aanmaken…' : 'Challenge aanmaken'}
            </button>

            {/* Bewaren mag ook zonder tafel: een favoriet gaat over de partij, niet over
                waar je speelt. */}
            <div className="mt-3">
              {bewaarNaam === null ? (
                <button onClick={() => setBewaarNaam('')}
                        className="text-xs text-ink-muted underline flex items-center gap-1.5">
                  <Ster className="w-3 h-3 text-brand" /> Deze instellingen bewaren als favoriet
                </button>
              ) : (
                <div className="flex gap-2">
                  <input value={bewaarNaam} onChange={(e) => setBewaarNaam(e.target.value)}
                         placeholder={tegenstander ? tegenstander.naam : 'naam van de favoriet'}
                         className={`${veld} text-sm`} />
                  <button onClick={bewaarAlsFavoriet}
                          className="rounded-lg border border-line px-3 text-sm shrink-0">bewaar</button>
                  <button onClick={() => setBewaarNaam(null)}
                          className="text-sm text-ink-muted underline shrink-0">annuleer</button>
                </div>
              )}
            </div>
            </Paneel>

            {/* ── Favorieten ───────────────────────────────────────────────────
                Eigen rode omlijning: dit is geen stap in het invullen maar een
                snelkoppeling die het formulier hierboven in één klap invult. */}
            {favorieten.length > 0 && (
              <Paneel titel="Favorieten" icoon={<Ster className="text-brand" />} rand="border-brand"
                      open={openFav} onToggle={() => setOpenFav(!openFav)}>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-[11px] text-ink-muted">
                    Tik een favoriet aan; de instellingen hierboven worden ingevuld.
                  </p>
                  <button onClick={() => setBewerken(!bewerken)}
                          className="text-xs text-ink-muted underline shrink-0 ml-2">
                    {bewerken ? 'klaar' : 'bewerken'}
                  </button>
                </div>
                <div className="space-y-2 mt-2">
                  {favorieten.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button onClick={() => kiesFavoriet(f)}
                              className="flex-1 text-left rounded-lg border border-line px-4 py-3 hover:border-ink-muted">
                        <span className="block font-medium">{f.naam}</span>
                        <span className="block text-xs text-ink-muted">
                          {f.tegenstanderNaam ? `tegen ${f.tegenstanderNaam} · ` : ''}
                          {spelNaam(f.discipline)} · race {f.raceTo} ·{' '}
                          {f.breakrule === 'winner' ? 'winner break' : 'alternate break'}
                        </span>
                      </button>
                      {bewerken && (
                        <button onClick={() => bewaarFavorieten(favorieten.filter((_, j) => j !== i))}
                                className="text-xs text-brand-light underline shrink-0">verwijder</button>
                      )}
                    </div>
                  ))}
                </div>
              </Paneel>
            )}

            <div className="mt-10 border-t border-line pt-4 text-xs text-ink-muted">
              <button onClick={() => setBeheer(!beheer)} className="underline">
                Instellingen {beheer ? 'verbergen' : 'tonen'}
              </button>
              {beheer && (
                <div className="mt-3 space-y-3">
                  <p>Ingelogd als <span className="text-ink">{lid && lid.email}</span></p>
                  <button onClick={verbreek} className="underline text-brand-light">
                    Koppeling verbreken en wachtwoord wissen
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
