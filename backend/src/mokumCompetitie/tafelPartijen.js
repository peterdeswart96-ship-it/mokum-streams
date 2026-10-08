// Tafelpartijen bij een competitiewedstrijd (v0.74). Cuescore koppelt een partij op een tafel aan zijn
// teamwedstrijd via match.parentId (= matchId van de teamwedstrijd). De teamwedstrijd zelf heeft geen
// tafel, dus de enige plek om te zien wat er nu op een tafel speelt is de overlay van die tafel
// (dezelfde aanroep als de scorebord-bewaking, #153). Pure delen hieronder zijn testbaar; alleen
// haalTafelPartijen doet netwerk.

const { TAFELS } = require('../challenge/cuescore');

const OVERLAY_URL = 'https://cuescore.com/ajax/scoreboard/overlay-v2.php';
const TIMEOUT_MS = 8000;
const POOLTAFELS = Array.from({ length: 16 }, (_, i) => i + 1); // zaal telt 16 pooltafels

// Eén overlay-antwoord → compacte partij, of null als er niets lopends is (WAITING, geen match,
// of een partij zonder teamwedstrijd erboven).
function partijUitOverlay(tafel, data) {
  if (!data || String(data.status || '').toUpperCase() !== 'PLAYING') return null;
  const m = data.match;
  if (!m || m.parentId == null || Number(m.parentId) === 0) return null;
  const naam = (p) => (p && p.name) || '';
  return {
    parentId: Number(m.parentId),
    tafel: Number(tafel),
    spelerA: naam(m.playerA),
    spelerB: naam(m.playerB),
    scoreA: m.scoreA != null ? Number(m.scoreA) : 0,
    scoreB: m.scoreB != null ? Number(m.scoreB) : 0,
    raceTo: m.raceTo != null ? Number(m.raceTo) : null,
  };
}

// Hangt de partijen aan hun teamwedstrijd. Partijen van een wedstrijd die niet in de lijst staat
// vallen weg (bv. een andere competitieavond-wedstrijd elders).
function koppelPartijen(competitie, partijen) {
  return (competitie || []).map((c) => ({
    ...c,
    partijen: (partijen || [])
      .filter((p) => p && p.parentId === Number(c.matchId))
      .sort((a, b) => a.tafel - b.tafel)
      .map(({ tafel, spelerA, spelerB, scoreA, scoreB, raceTo }) => ({ tafel, spelerA, spelerB, scoreA, scoreB, raceTo })),
  }));
}

async function haalOverlay(tableId) {
  const res = await fetch(OVERLAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tableId: String(tableId), lang: 'nl' }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Alle pooltafels parallel. Een tafel die niet antwoordt telt als "niets lopends": één haperende
// aanvraag mag de rest niet tegenhouden. `haal` is injecteerbaar voor tests.
async function haalTafelPartijen({ haal = haalOverlay } = {}) {
  const uit = await Promise.allSettled(POOLTAFELS.map((nr) => haal(TAFELS[nr]).then((d) => partijUitOverlay(nr, d))));
  return uit.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

module.exports = { partijUitOverlay, koppelPartijen, haalTafelPartijen };
