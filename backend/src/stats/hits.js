// Pure teller-logica (#18 fase 1 — cookieloze bezoek-/QR-teller). Géén netwerk/opslag
// → volledig unit-testbaar. Cookieloos en privacyvriendelijk: we tellen alléén op
// (totalen per bron/pagina/dag), we bewaren geen persoonsgegevens of IP's → geen
// consent-banner nodig. De functie-laag (functions/stats.js) doet de opslag.

const MAX_DAGEN = 120;

// Normaliseert een vrije sleutel (bron/pagina uit de query) tot een veilige, korte
// key, zodat willekeurige of rommelige waarden de opslag niet kunnen opblazen.
function normaliseerSleutel(waarde, fallback) {
  const s = String(waarde == null ? '' : waarde)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return s ? s.slice(0, 24) : fallback;
}

function leeg() {
  return { updatedAt: null, totaal: 0, perBron: {}, perPagina: {}, perDag: {} };
}

// Registreert één hit; geeft een NIEUW store-object terug (muteert de input niet).
//   source : bv. 'qr' | 'youtube' | 'direct' (uit utm_source) → geteld onder perBron
//   page   : bv. 'standen' → geteld onder perPagina
//   dagKey : 'YYYY-MM-DD' (aanroeper levert de dag) → geteld onder perDag
//   now    : ISO-tijd voor updatedAt (optioneel; pure module krijgt de tijd aangereikt)
function registreerHit(store, { source, page, dagKey, now } = {}) {
  const s = store && typeof store === 'object' ? JSON.parse(JSON.stringify(store)) : leeg();
  s.totaal = (s.totaal || 0) + 1;
  s.perBron = s.perBron || {};
  s.perPagina = s.perPagina || {};
  s.perDag = s.perDag || {};
  const bron = normaliseerSleutel(source, 'direct');
  const pagina = normaliseerSleutel(page, 'standen');
  s.perBron[bron] = (s.perBron[bron] || 0) + 1;
  s.perPagina[pagina] = (s.perPagina[pagina] || 0) + 1;
  const dag = (s.perDag[dagKey] = s.perDag[dagKey] || { totaal: 0, perBron: {} });
  dag.totaal += 1;
  dag.perBron[bron] = (dag.perBron[bron] || 0) + 1;
  if (now) s.updatedAt = now;
  return s;
}

// Houdt perDag bij tot de laatste `maxDagen` dagen (voorkomt onbegrensde groei).
function schoonPerDag(store, maxDagen = MAX_DAGEN) {
  if (!store || !store.perDag) return store;
  const dagen = Object.keys(store.perDag).sort();
  if (dagen.length <= maxDagen) return store;
  const teHouden = new Set(dagen.slice(dagen.length - maxDagen));
  const perDag = {};
  for (const d of dagen) if (teHouden.has(d)) perDag[d] = store.perDag[d];
  return { ...store, perDag };
}

module.exports = { registreerHit, schoonPerDag, normaliseerSleutel, MAX_DAGEN };
