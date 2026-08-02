const { readJson, writeJson, deleteBlob } = require('../storage/blob');
const { versleutel, ontsleutel, haalSleutel } = require('./kluis');
const { ledId } = require('./token');
const { normaliseerSjablonen, STANDAARD } = require('./sjablonen');
const cuescore = require('./cuescore');

// Opslag en sessiebeheer per lid (#90).
//
// Wat er per lid ligt: het versleutelde Cuescore-wachtwoord, de laatste Cuescore-sessie
// (cookies) en zijn sjablonen. Het wachtwoord verlaat deze module nooit in leesbare vorm
// en gaat nooit richting frontend of logging.

const pad = (id) => `challenge/leden/${id}.json`;

const lees = (id) => readJson(pad(id), null);
const schrijf = (id, record) => writeJson(pad(id), record);

// Wat de frontend mag zien. Bewust een witte lijst, geen zwarte: zo kan er nooit per
// ongeluk een geheim meelekken als het record later een veld erbij krijgt.
function publiek(record) {
  if (!record) return null;
  return {
    naam: record.naam || '',
    email: record.email || '',
    sjablonen: record.sjablonen || [],
    aangemaakt: record.aangemaakt || null,
    laatstGebruikt: record.laatstGebruikt || null,
  };
}

// Nieuw lid koppelen: inloggen bij Cuescore, en pas bij succes iets opslaan.
// Retour: { ok, ledId, record } of { ok: false, melding }.
async function koppel(email, wachtwoord) {
  const poging = await cuescore.login(email, wachtwoord);
  if (!poging.ok) return { ok: false, melding: poging.melding };

  const id = ledId(email);
  const bestaand = await lees(id);
  const record = {
    email: String(email).trim().toLowerCase(),
    naam: (bestaand && bestaand.naam) || '',
    geheim: versleutel(wachtwoord, await haalSleutel()),
    cookies: poging.cookies,
    sjablonen: (bestaand && bestaand.sjablonen) || [STANDAARD],
    aangemaakt: (bestaand && bestaand.aangemaakt) || new Date().toISOString(),
    laatstGebruikt: new Date().toISOString(),
  };
  await schrijf(id, record);
  return { ok: true, ledId: id, record };
}

// Een bruikbare Cuescore-sessie voor dit lid.
//
// Eerst de opgeslagen cookies proberen — dat scheelt een inlogronde bij elke aanvraag.
// Zijn die verlopen, dan loggen we opnieuw in met het opgeslagen wachtwoord en bewaren we
// de verse cookies. Lukt dat ook niet (lid heeft z'n wachtwoord gewijzigd, account
// geblokkeerd), dan is er niets meer aan te doen: het lid moet opnieuw koppelen.
//
// Retour: { ok, cookies } of { ok: false, reden: 'opnieuw-inloggen' }.
async function sessie(id, record) {
  if (record && record.cookies && await cuescore.sessieGeldig(record.cookies)) {
    return { ok: true, cookies: record.cookies };
  }
  if (!record || !record.geheim) return { ok: false, reden: 'opnieuw-inloggen' };

  let wachtwoord;
  try {
    wachtwoord = ontsleutel(record.geheim, await haalSleutel());
  } catch {
    // Sleutel gewijzigd of data beschadigd → niet te herstellen, opnieuw koppelen.
    return { ok: false, reden: 'opnieuw-inloggen' };
  }

  const poging = await cuescore.login(record.email, wachtwoord);
  if (!poging.ok) return { ok: false, reden: 'opnieuw-inloggen' };

  await schrijf(id, { ...record, cookies: poging.cookies, laatstGebruikt: new Date().toISOString() });
  return { ok: true, cookies: poging.cookies };
}

async function bewaarSjablonen(id, record, rauw) {
  const sjablonen = normaliseerSjablonen(rauw);
  await schrijf(id, { ...record, sjablonen });
  return sjablonen;
}

// Koppeling verbreken: het hele record weg, dus ook het versleutelde wachtwoord en de
// sessie. Geen "uitgeschakeld"-vlaggetje — weg is weg.
async function ontkoppel(id) {
  await deleteBlob(pad(id));
}

module.exports = { lees, schrijf, publiek, koppel, sessie, bewaarSjablonen, ontkoppel, pad };
