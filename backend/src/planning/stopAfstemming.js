// Pure logica voor de stop-afstemcheck (#113). Géén netwerk/opslag → volledig unit-testbaar.
//
// Het probleem (22-08 t/m 24-08, vijf keer): overal waar we een stream stoppen zetten we
// `entry.stopped = true` zodra het stopStream-commando is WEGGESCHREVEN, niet zodra OBS het
// echt heeft uitgevoerd. Mist de agent het commando, dan staat de tafel in ons dashboard op
// "offline" terwijl de uitzending op YouTube gewoon doorloopt, onbewaakt.
//
// Dit vangnet vergelijkt daarom de registratie (`stopped`) met wat de agent meldt (status.json):
// zendt de tafel na een korte gratietijd nog steeds, dan sturen we opnieuw een stopStream.
// Helpt dat ook niet (op 23-08 kwam een commando voor tafel 15 structureel niet aan), dan
// geven we na MAX_STOP_POGINGEN op en alarmeren we eenmalig — zoals bij moetAlarmeren() (#114).

const GRATIE_MS = 3 * 60 * 1000; // zoveel tijd mag OBS nemen om een stop te verwerken
const HERPOGING_MS = 2 * 60 * 1000; // niet vaker dan om de 2 minuten opnieuw sturen
const MAX_STOP_POGINGEN = 3;

// Alleen een meting waarin de agent OBS-verbinding meldt telt mee (zelfde regel als
// agent/statusOmslag.js): zonder verbinding is 'streaming: false' geen bewijs van een stop,
// maar 'streaming: true' is dat wél altijd een bewijs van zenden.
function zendtNog(tafelStatus) {
  return !!tafelStatus && tafelStatus.streaming === true;
}

// entry: broadcasts-store-entry (met o.a. stopped, stopAfwijkingSinds, stopPogingen,
//   laatsteStopPoging, stopAlertVerstuurd). tafelStatus: het `tables`-item uit status.json.
// Geeft { actie, patch } terug. `patch` wordt over de entry heen gelegd (alleen als niet leeg).
//   actie: 'geen' | 'wacht' | 'herstop' | 'alarm'
function stopAfstemming(entry, tafelStatus, nowMs, {
  gratieMs = GRATIE_MS, herpogingMs = HERPOGING_MS, maxPogingen = MAX_STOP_POGINGEN,
} = {}) {
  if (!entry || !entry.stopped) return { actie: 'geen', patch: {} };

  if (!zendtNog(tafelStatus)) {
    // Alles klopt (of we weten het niet). Een eerder gestempelde afwijking opruimen, zodat
    // een latere, nieuwe afwijking weer met een verse gratietijd begint.
    return { actie: 'geen', patch: entry.stopAfwijkingSinds ? { stopAfwijkingSinds: null } : {} };
  }

  const sinds = Date.parse(entry.stopAfwijkingSinds || '');
  if (Number.isNaN(sinds)) {
    return { actie: 'wacht', patch: { stopAfwijkingSinds: new Date(nowMs).toISOString() } };
  }
  if (nowMs - sinds < gratieMs) return { actie: 'wacht', patch: {} };

  const pogingen = Number(entry.stopPogingen) || 0;
  if (pogingen >= maxPogingen) {
    if (entry.stopAlertVerstuurd) return { actie: 'geen', patch: {} };
    return { actie: 'alarm', patch: { stopAlertVerstuurd: true } };
  }

  const laatste = Date.parse(entry.laatsteStopPoging || '') || 0;
  if (nowMs - laatste < herpogingMs) return { actie: 'wacht', patch: {} };

  return {
    actie: 'herstop',
    patch: { stopPogingen: pogingen + 1, laatsteStopPoging: new Date(nowMs).toISOString() },
  };
}

module.exports = { stopAfstemming, zendtNog, GRATIE_MS, HERPOGING_MS, MAX_STOP_POGINGEN };
