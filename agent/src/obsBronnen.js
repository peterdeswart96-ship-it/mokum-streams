// Pure logica voor scripts/obs-bronnen-uitlezen.js (#98): leest niets van OBS zelf, maar
// maakt van wat het script ophaalde een veilige, vergelijkbare beschrijving. Géén netwerk →
// unit-testbaar.
//
// Waarom: de URL's van de OBS-browserbronnen stonden nergens in de repo, dus "staat overal de
// nieuwe versie?" was alleen te beantwoorden door in OBS te kijken (#96). Dit legt vast wat er
// écht staat, in plaats van wat er volgens de code zou moeten staan.
//
// Veiligheid (werkafspraak 4): camerabronnen (RTSP/UniFi Protect) kunnen inloggegevens in hun URL
// hebben. Van bronnen die geen browserbron zijn tonen we daarom NOOIT instellingen, alleen het
// type. En ook in een browser-URL maskeren we gebruikersnaam/wachtwoord en gevoelige parameters.

const GEVOELIGE_PARAM_RE = /token|key|secret|pass|pwd|auth|sig|credential/i;

// Maskeert het gevoelige deel van een URL. Geeft altijd een string terug, ook bij rommel.
function maskeerUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const u = new URL(url);
    if (u.username || u.password) { u.username = '***'; u.password = ''; }
    for (const k of [...u.searchParams.keys()]) {
      if (GEVOELIGE_PARAM_RE.test(k)) u.searchParams.set(k, '***');
    }
    return u.toString();
  } catch {
    // Geen geldige URL (bijv. een lokaal pad): dan is er geen user:pass@-vorm, maar voor de
    // zekerheid toch een eventueel "://user:pass@" wegpoetsen.
    return url.replace(/:\/\/[^/@\s]+@/, '://***@');
  }
}

// Vervangt het tafelnummer in de URL door {N}, zodat de URL van tafel 1 en tafel 3 vergeleken
// kunnen worden: `?tafel=1` en `?table=3` zijn dan gelijk (dat hoort ook zo).
function normaliseerUrl(url, tafel) {
  return String(url || '').replace(new RegExp(`([?&](?:tafel|table)=)${Number(tafel)}(?=&|$)`, 'i'), '$1{N}');
}

// Reduceert de instellingen van één bron tot wat veilig en relevant is.
//   soort   : OBS inputKind, bijv. 'browser_source'
//   settings: inputSettings uit GetInputSettings
function veiligeInstellingen(soort, settings) {
  const s = settings || {};
  if (soort === 'browser_source') {
    return {
      url: s.is_local_file ? String(s.local_file || '') : maskeerUrl(s.url),
      lokaalBestand: !!s.is_local_file,
      breedte: s.width ?? null,
      hoogte: s.height ?? null,
      fps: s.fps_custom ? (s.fps ?? null) : null,
      // "Vernieuwen wanneer scène actief wordt" (bij de intro bewust UIT, #58).
      verversBijActief: s.restart_when_active ?? null,
      // "Bron uitschakelen wanneer niet zichtbaar".
      stopBijVerborgen: s.shutdown ?? null,
      eigenCss: !!(s.css && String(s.css).trim()),
    };
  }
  if (soort === 'image_slideshow') {
    return { bestanden: Array.isArray(s.files) ? s.files.length : null, slideTijdMs: s.slide_time ?? null };
  }
  return {}; // camera's e.d.: alleen het type, zie de veiligheidsnotitie bovenaan
}

// Eén regel per bron in de vergelijking: alles wat tussen tafels gelijk hoort te zijn.
// Zichtbaarheid en slot laten we bewust weg: die schakelen tijdens een avond.
function handtekening(bron, tafel) {
  const i = { ...(bron.instellingen || {}) };
  if (i.url) i.url = normaliseerUrl(i.url, tafel);
  return JSON.stringify({ soort: bron.soort, ...i });
}

// tafels: [{ tafel, bronnen: [{ naam, soort, instellingen, ... }] }] (bronnen bovenaan eerst).
// Retour: lijst van verschillen in gewone taal (leeg = alle tafels gelijk).
function vergelijkTafels(tafels) {
  const verschillen = [];
  const bereikbaar = (tafels || []).filter((t) => t && Array.isArray(t.bronnen));
  if (bereikbaar.length < 2) return verschillen;

  const namen = [...new Set(bereikbaar.flatMap((t) => t.bronnen.map((b) => b.naam)))];
  for (const naam of namen) {
    const per = bereikbaar.map((t) => ({ tafel: t.tafel, bron: t.bronnen.find((b) => b.naam === naam) }));
    const ontbreekt = per.filter((p) => !p.bron).map((p) => p.tafel);
    if (ontbreekt.length) {
      verschillen.push(`Bron '${naam}' ontbreekt op tafel ${ontbreekt.join(', ')}.`);
    }
    const aanwezig = per.filter((p) => p.bron);
    const groepen = new Map();
    for (const p of aanwezig) {
      const h = handtekening(p.bron, p.tafel);
      groepen.set(h, [...(groepen.get(h) || []), p.tafel]);
    }
    if (groepen.size > 1) {
      const delen = [...groepen.entries()].map(([h, ts]) => `tafel ${ts.join(', ')}: ${h}`);
      verschillen.push(`Bron '${naam}' verschilt tussen tafels — ${delen.join(' | ')}`);
    }
  }

  // Volgorde van de bronnen (van boven naar onder), alleen de bronnen die overal voorkomen.
  const gemeenschappelijk = namen.filter((n) => bereikbaar.every((t) => t.bronnen.some((b) => b.naam === n)));
  const volgorde = (t) => t.bronnen.map((b) => b.naam).filter((n) => gemeenschappelijk.includes(n)).join(' > ');
  const volgordes = new Map();
  for (const t of bereikbaar) volgordes.set(volgorde(t), [...(volgordes.get(volgorde(t)) || []), t.tafel]);
  if (volgordes.size > 1) {
    const delen = [...volgordes.entries()].map(([v, ts]) => `tafel ${ts.join(', ')}: ${v}`);
    verschillen.push(`De bronvolgorde (boven → onder) verschilt — ${delen.join(' | ')}`);
  }
  return verschillen;
}

const ja = (v) => (v === true ? 'ja' : v === false ? 'nee' : '?');
const cel = (t) => String(t).replace(/\|/g, '\\|');

// Markdown-rapport voor docs/obs-standaard.md. `nu` is een Date (parameter voor testbaarheid).
function maakMarkdown(tafels, nu = new Date()) {
  const r = [];
  r.push(`_Uitgelezen uit OBS op ${nu.toISOString().slice(0, 10)} met \`agent/scripts/obs-bronnen-uitlezen.js\` (#98). Bronnen staan van boven naar onder, zoals in OBS._`, '');
  for (const t of tafels) {
    r.push(`### Tafel ${t.tafel}`, '');
    if (t.fout) { r.push(`⚠ Niet uit te lezen: ${cel(t.fout)}`, ''); continue; }
    r.push(`Scène: \`${t.scene}\``, '');
    r.push('| Bron | Soort | Zichtbaar | Slot | URL / details | Afmeting | Vernieuwen bij actief | Uit bij verborgen |');
    r.push('|---|---|---|---|---|---|---|---|');
    for (const b of t.bronnen) {
      const i = b.instellingen || {};
      const details = i.url !== undefined
        ? `\`${cel(i.url)}\``
        : i.bestanden !== undefined ? `${i.bestanden} bestand(en), ${i.slideTijdMs} ms per slide` : '';
      const afm = i.breedte != null ? `${i.breedte}×${i.hoogte}` : '';
      r.push(`| ${cel(b.naam)} | ${cel(b.soort)} | ${ja(b.zichtbaar)} | ${ja(b.vergrendeld)} | ${details} | ${afm} | ${i.verversBijActief != null ? ja(i.verversBijActief) : ''} | ${i.stopBijVerborgen != null ? ja(i.stopBijVerborgen) : ''} |`);
    }
    r.push('');
  }
  const verschillen = vergelijkTafels(tafels);
  r.push('### Verschillen tussen de tafels', '');
  if (verschillen.length) for (const v of verschillen) r.push(`- ${v}`);
  else r.push('Geen: op alle uitgelezen tafels staan dezelfde bronnen met dezelfde instellingen (het tafelnummer in de URL daargelaten).');
  r.push('');
  return r.join('\n');
}

module.exports = { maskeerUrl, normaliseerUrl, veiligeInstellingen, vergelijkTafels, maakMarkdown };
