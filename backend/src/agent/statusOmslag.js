// Pure logica: welke tafels zijn tussen twee statusmeldingen van de agent gaan zenden of
// gestopt (#116). Géén netwerk/opslag → unit-testbaar.
//
// Waarom dit bestaat: alle logregels van de backend beschrijven wat de backend BESLOOT te doen
// (een startcommando versturen, een stop besluiten), niet wat OBS daarna deed. Het ochtendrapport
// kon daardoor niet zien of een start of stop echt was uitgevoerd (24-08 en 25-08 startten
// tafel 1 en 3 niet vanzelf, en toch stond er 'Niets bijzonders'). Een omslag in wat de agent
// meldt is het eerste echte bewijs dat OBS iets deed — ook als iemand het met de hand in OBS
// zelf deed, want dan is er wél een omslag maar geen commando.
//
// Bewust alléén een omslag, geen regel per statuspost: de agent post elke paar seconden, en
// dat zouden duizenden logregels per avond zijn.

// Een tafel telt alleen mee als de agent in BEIDE metingen een OBS-verbinding meldt: zonder
// verbinding weet de agent niet of er gezonden wordt, en 'streaming: false' is dan geen stop.
function metingTelt(t) {
  return !!t && t.obsConnected !== false && typeof t.streaming === 'boolean';
}

// vorige / nieuwe: de `tables`-lijst uit status.json (of null/undefined als er nog geen was).
// Retour: [{ tafel, naar: 'zendt' | 'gestopt', bitrateKbps }] in tafelvolgorde.
function statusOmslagen(vorige, nieuwe) {
  if (!Array.isArray(vorige) || !Array.isArray(nieuwe)) return [];
  const eerder = new Map(vorige.map((t) => [Number(t && t.tableNumber), t]));

  const omslagen = [];
  for (const t of nieuwe) {
    if (!metingTelt(t)) continue;
    const tafel = Number(t.tableNumber);
    const voor = eerder.get(tafel);
    if (!metingTelt(voor) || voor.streaming === t.streaming) continue;
    omslagen.push({
      tafel,
      naar: t.streaming ? 'zendt' : 'gestopt',
      bitrateKbps: t.streaming ? Number(t.bitrateKbps) || 0 : null,
    });
  }
  return omslagen.sort((a, b) => a.tafel - b.tafel);
}

// De logregel per omslag. Vast formaat, want het ochtendrapport leest hem later terug:
//   [agent] tafel 1: OBS meldt: zendt (16033 kbps)
//   [agent] tafel 1: OBS meldt: gestopt
function omslagRegel(o) {
  return `[agent] tafel ${o.tafel}: OBS meldt: ${o.naar}${o.naar === 'zendt' ? ` (${o.bitrateKbps} kbps)` : ''}`;
}

module.exports = { statusOmslagen, omslagRegel };
