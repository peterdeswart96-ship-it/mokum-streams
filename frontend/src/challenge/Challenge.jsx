import { useState, useEffect, useCallback } from 'react';
import * as api from './api';

// Challenge-pagina voor Mokum-leden (#90).
//
// Doel: aan de tafel, op je telefoon, in drie tikken een challenge in Cuescore hebben —
// sjabloon, tafel, aanmaken. Wie mag beginnen wordt bewust NIET geregeld: dat bepaalt de
// lag aan de tafel.

const CAMERA = '📹';

// ── Kleine bouwstenen ────────────────────────────────────────────────────────

function Knop({ children, actief, ...rest }) {
  return (
    <button
      {...rest}
      className={`w-full text-left rounded-lg border px-4 py-3 text-base transition ${
        actief ? 'border-brand bg-brand/15 text-ink' : 'border-line text-ink hover:border-ink-muted'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Melding({ soort = 'fout', children }) {
  const kleur = soort === 'fout'
    ? 'border-brand/50 bg-brand/10 text-brand-light'
    : 'border-emerald-600/50 bg-emerald-600/10 text-emerald-300';
  return <p className={`text-sm rounded-lg border px-3 py-2 ${kleur}`}>{children}</p>;
}

function Kop({ children }) {
  return <h2 className="text-sm font-medium text-ink-muted mb-2 mt-6">{children}</h2>;
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

  const veld = 'w-full bg-canvas border border-line rounded-lg px-3 py-3 text-ink text-base';

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

  // Even wachten met zoeken tot je uitgetypt bent — anders vuurt elke toetsaanslag
  // een aanvraag af die via onze backend naar Cuescore gaat.
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
      <div className="flex items-center justify-between rounded-lg border border-brand bg-brand/15 px-4 py-3">
        <span>{gekozen.naam}</span>
        <button onClick={() => onKies(null)} className="text-sm text-ink-muted underline">wijzig</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam…"
             className="w-full bg-canvas border border-line rounded-lg px-3 py-3 text-ink text-base" />
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
  const [tafels, setTafels] = useState([]);
  const [cameraTafels, setCameraTafels] = useState([]);

  const [sjabloon, setSjabloon] = useState(null);
  const [tegenstander, setTegenstander] = useState(null);
  const [tafel, setTafel] = useState(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [klaar, setKlaar] = useState(null);   // { challengeId, url }
  const [beheer, setBeheer] = useState(false);

  const laad = useCallback(async () => {
    try {
      const d = await api.getMe();
      setLid(d.lid);
      setTafels(d.alleTafels || []);
      setCameraTafels(d.tafels || []);
      setStatus('ok');
    } catch (e) {
      if (e.opnieuwInloggen || e.status === 401) { api.clearToken(); setStatus('uitgelogd'); }
      else { setFout(e.message); setStatus('ok'); }
    }
  }, []);

  useEffect(() => { if (status === 'laden') laad(); }, [status, laad]);

  // Heb je maar één sjabloon, dan valt er niets te kiezen — meteen aanzetten, zodat je
  // direct de tafels ziet in plaats van een scherm met één knop en een uitgegrijsde
  // aanmaakknop eronder.
  useEffect(() => {
    const s = lid && lid.sjablonen;
    if (!sjabloon && s && s.length === 1) setSjabloon(s[0]);
  }, [lid, sjabloon]);

  function opnieuw() {
    setSjabloon(null); setTegenstander(null); setTafel(null); setKlaar(null); setFout('');
  }

  async function aanmaken() {
    setBezig(true); setFout('');
    try {
      const r = await api.maakChallenge({
        tegenstanderId: (sjabloon.tegenstanderId || (tegenstander && tegenstander.playerId)),
        tafel,
        discipline: sjabloon.discipline,
        raceTo: sjabloon.raceTo,
        breakrule: sjabloon.breakrule,
      });
      setKlaar(r);
    } catch (e) {
      if (e.opnieuwInloggen) { api.clearToken(); setStatus('uitgelogd'); }
      else setFout(e.message);
    } finally {
      setBezig(false);
    }
  }

  async function verbreek() {
    if (!window.confirm('Koppeling verbreken? Je opgeslagen wachtwoord wordt gewist.')) return;
    try { await api.loskoppelen(); } catch { /* weg is weg, ook als het al weg was */ }
    api.clearToken();
    setStatus('uitgelogd');
  }

  // Wie is de tegenstander bij het gekozen sjabloon — vast, of nog te kiezen?
  const tegenstanderNodig = sjabloon && !sjabloon.tegenstanderId;
  const magAanmaken = sjabloon && tafel && (sjabloon.tegenstanderId || tegenstander);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* De kop hoort in dezelfde kolom als de rest. Stond die buiten de container, dan
          plakt hij op een breed scherm linksboven in de hoek terwijl de inhoud in het
          midden zweeft — dat ziet eruit alsof de opmaak stuk is. */}
      <header className="border-b border-line">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-xl font-display">
            <span className="text-brand">Mokum</span> Challenge
          </h1>
          <p className="text-xs text-ink-muted">Snel een challenge aanmaken in Cuescore</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-16">
        {status === 'laden' && <p className="text-sm text-ink-muted mt-8">Laden…</p>}

        {status === 'uitgelogd' && (
          <div className="mt-6"><Inloggen onKlaar={() => setStatus('laden')} /></div>
        )}

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
            <Kop>1. Wat spelen jullie?</Kop>
            <div className="space-y-2">
              {(lid?.sjablonen || []).map((s, i) => (
                <Knop key={i} actief={sjabloon === s} onClick={() => { setSjabloon(s); setTegenstander(null); }}>
                  <span className="block font-medium">{s.naam}</span>
                  <span className="block text-xs text-ink-muted">
                    {s.tegenstanderNaam ? `tegen ${s.tegenstanderNaam} · ` : ''}
                    race naar {s.raceTo} · {s.breakrule === 'winner' ? 'winner break' : 'alternate break'}
                  </span>
                </Knop>
              ))}
              {!lid?.sjablonen?.length && (
                <p className="text-sm text-ink-muted">Nog geen sjablonen. Maak er een aan bij Instellingen.</p>
              )}
            </div>

            {tegenstanderNodig && (
              <>
                <Kop>2. Tegen wie?</Kop>
                <ZoekTegenstander gekozen={tegenstander} onKies={setTegenstander} />
              </>
            )}

            {sjabloon && (
              <>
                <Kop>{tegenstanderNodig ? '3' : '2'}. Welke tafel?</Kop>
                <div className="grid grid-cols-5 gap-2">
                  {tafels.map((n) => (
                    <button key={n} onClick={() => setTafel(n)}
                      className={`rounded-lg border py-3 text-base ${
                        tafel === n ? 'border-brand bg-brand/15' : 'border-line text-ink-muted'
                      }`}>
                      {n}
                      {cameraTafels.includes(n) && <span className="block text-[9px] leading-none">{CAMERA}</span>}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-muted mt-2">{CAMERA} = tafel met camera</p>
              </>
            )}

            {fout && <div className="mt-4"><Melding>{fout}</Melding></div>}

            <button disabled={!magAanmaken || bezig} onClick={aanmaken}
                    className="w-full mt-6 bg-brand hover:bg-brand-dark text-white rounded-lg px-4 py-4 font-medium text-base disabled:opacity-40">
              {bezig ? 'Aanmaken…' : 'Challenge aanmaken'}
            </button>

            <div className="mt-10 border-t border-line pt-4 text-xs text-ink-muted">
              <button onClick={() => setBeheer(!beheer)} className="underline">
                Instellingen {beheer ? 'verbergen' : 'tonen'}
              </button>
              {beheer && (
                <div className="mt-3 space-y-3">
                  <p>Ingelogd als <span className="text-ink">{lid?.email}</span></p>
                  <Sjabloonbeheer sjablonen={lid?.sjablonen || []}
                                  onBewaard={(s) => setLid({ ...lid, sjablonen: s })} />
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

// ── Sjablonen beheren ────────────────────────────────────────────────────────

function Sjabloonbeheer({ sjablonen, onBewaard }) {
  const [lijst, setLijst] = useState(sjablonen);
  const [tegenstander, setTegenstander] = useState(null);
  const [raceTo, setRaceTo] = useState(5);
  const [naam, setNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  async function bewaar(nieuw) {
    setBezig(true); setFout('');
    try {
      const r = await api.bewaarSjablonen(nieuw);
      setLijst(r.sjablonen);
      onBewaard(r.sjablonen);
    } catch (e) { setFout(e.message); }
    finally { setBezig(false); }
  }

  function voegToe() {
    bewaar([...lijst, {
      naam: naam.trim() || (tegenstander ? tegenstander.naam : `9-ball race ${raceTo}`),
      discipline: 3,
      raceTo: Number(raceTo),
      breakrule: 'winner',
      ...(tegenstander ? { tegenstanderId: tegenstander.playerId, tegenstanderNaam: tegenstander.naam } : {}),
    }]);
    setNaam(''); setTegenstander(null);
  }

  const veld = 'w-full bg-canvas border border-line rounded px-2 py-2 text-ink text-sm';

  return (
    <div className="space-y-2">
      <p className="text-ink">Sjablonen</p>
      {lijst.map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <span>{s.naam} <span className="opacity-60">· race {s.raceTo}</span></span>
          <button disabled={bezig} onClick={() => bewaar(lijst.filter((_, j) => j !== i))}
                  className="underline shrink-0">verwijder</button>
        </div>
      ))}

      <div className="pt-2 space-y-2">
        <input value={naam} onChange={(e) => setNaam(e.target.value)}
               placeholder="Naam (bijv. Lennert)" className={veld} />
        <input type="number" min="1" max="200" value={raceTo}
               onChange={(e) => setRaceTo(e.target.value)} placeholder="race naar" className={veld} />
        <p className="text-ink">Vaste tegenstander (mag leeg)</p>
        <ZoekTegenstander gekozen={tegenstander} onKies={setTegenstander} />
        <button disabled={bezig} onClick={voegToe} className="underline">Sjabloon toevoegen</button>
      </div>

      {fout && <Melding>{fout}</Melding>}
    </div>
  );
}
