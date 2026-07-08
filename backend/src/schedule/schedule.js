// Pure planningslogica: bepaalt welke schema-regels "nu" een broadcast moeten
// krijgen, en welke tafels daarvan nog te maken zijn. Géén netwerk → testbaar.
// De timer-Function (functions/createBroadcasts.js) gebruikt deze functies.

// Weekdag (en-GB kort) → 1=ma ... 7=zo (zoals in de schema-regels).
const DAG_KORT = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// 'HH:MM' → minuten sinds middernacht.
function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) throw new Error(`ongeldige tijd: ${hhmm}`);
  const uur = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (uur > 23 || min > 59) throw new Error(`ongeldige tijd: ${hhmm}`);
  return uur * 60 + min;
}

// Zet een moment om naar de zaal-tijdzone (Europe/Amsterdam) en geeft de weekdag,
// de minuut-van-de-dag en de datum (YYYY-MM-DD). Intl regelt DST automatisch.
function zaalDelen(date, tz = 'Europe/Amsterdam') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    dagVanDeWeek: DAG_KORT[get('weekday')],
    minutenVanDeDag: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
    datum: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

// Is een regel "nu" aan de beurt om een broadcast aan te maken?
// De aanmaak begint op startTijd − leadMinuten en blijft geldig tot startTijd +
// graceMinuten (zodat een iets te late timer-run alsnog aanmaakt). Idempotentie
// (niet dubbel aanmaken) doet de orkestrator via de broadcasts-opslag.
function isRuleDueNow(rule, now, { graceMinuten = 30, tz = 'Europe/Amsterdam' } = {}) {
  if (!rule || rule.actief === false) return false;
  const { dagVanDeWeek, minutenVanDeDag } = zaalDelen(now, tz);
  if (dagVanDeWeek !== rule.dagVanDeWeek) return false;
  const start = parseTime(rule.startTijd);
  const lead = rule.leadMinuten == null ? 15 : rule.leadMinuten;
  const creatie = start - lead;
  return minutenVanDeDag >= creatie && minutenVanDeDag <= start + graceMinuten;
}

// Filtert de regels die nu aan de beurt zijn.
function dueRules(rules, now, opts) {
  return (rules || []).filter((r) => isRuleDueNow(r, now, opts));
}

// Welke tafels van een regel hebben vandaag nog geen broadcast?
// `store` is het object uit broadcasts/<datum>.json, gesleuteld op tafelnummer.
function tafelsNogTeMaken(rule, store) {
  const s = store || {};
  return (rule.tafels || []).filter((t) => !s[String(t)] && !s[t]);
}

// Zet de wandkloktijd van vandaag (Amsterdam) + 'HH:MM' om naar een UTC-ISO-string
// voor scheduledStartTime. Bepaalt de tijdzone-offset op dat moment (DST-veilig)
// via de bekende toLocaleString-truc.
function scheduledStartISO(now, startTijd, tz = 'Europe/Amsterdam') {
  const { datum } = zaalDelen(now, tz);
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const minuten = parseTime(startTijd);
  const uur = Math.floor(minuten / 60);
  const min = minuten % 60;
  const gokUtc = Date.UTC(jaar, maand - 1, dag, uur, min);
  const alsTz = new Date(gokUtc).toLocaleString('en-US', { timeZone: tz });
  const alsUtc = new Date(gokUtc).toLocaleString('en-US', { timeZone: 'UTC' });
  const offset = new Date(alsUtc).getTime() - new Date(alsTz).getTime();
  return new Date(gokUtc + offset).toISOString();
}

module.exports = {
  DAG_KORT,
  parseTime,
  zaalDelen,
  isRuleDueNow,
  dueRules,
  tafelsNogTeMaken,
  scheduledStartISO,
};
