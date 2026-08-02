// Cuescore-client voor het aanmaken van challenges (#90).
//
// Volledig live geverifieerd op 02-08-2026 — zie docs/cuescore-challenge.md voor de
// waargenomen aanroepen en de valkuilen. De belangrijkste: het formulier op /login/
// verstuurt zichzelf NIET; hun JavaScript post naar /ajax/user/login.php. Een POST naar
// /login/ geeft stilzwijgend een 200 met de pagina terug en géén sessie.

const BASIS = 'https://cuescore.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// Locatie en tafels van Mokum. De tafel-id's zijn NIET af te leiden uit het tafelnummer
// (tafel 5 valt buiten de reeks van de rest), dus ze staan hier hard.
const VENUE_ID = 60451687; // let op: er is ook een lege locatie "Mokum" (65271949)
const TAFELS = {
  1: 61403749, 2: 61403761, 3: 61403764, 4: 61403767, 5: 73782388,
  6: 61403773, 7: 61403776, 8: 61403779, 9: 61403782, 10: 61403785,
  11: 61403788, 12: 61403791, 13: 61403794, 14: 61403797, 15: 61403800,
  16: 61403803, 17: 74876986, 18: 74877322, 19: 74877334,
};
const CAMERA_TAFELS = [1, 3, 15, 16];

const cookieHeader = (cookies) => Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');

// Verzamelt Set-Cookie uit een antwoord in het meegegeven object (dat we per lid opslaan).
function bewaarCookies(res, cookies) {
  for (const regel of res.headers.getSetCookie?.() || []) {
    const [paar] = regel.split(';');
    const i = paar.indexOf('=');
    if (i > 0) cookies[paar.slice(0, i).trim()] = paar.slice(i + 1).trim();
  }
  return cookies;
}

async function haal(pad, cookies, opties = {}) {
  const res = await fetch(pad.startsWith('http') ? pad : BASIS + pad, {
    ...opties,
    redirect: 'manual', // zelf afhandelen; anders raken we cookies onderweg kwijt
    headers: {
      'User-Agent': UA,
      ...(Object.keys(cookies || {}).length ? { Cookie: cookieHeader(cookies) } : {}),
      ...(opties.headers || {}),
    },
  });
  bewaarCookies(res, cookies);
  return res;
}

// Inloggen. Retour: { ok, cookies, melding }. Bij ok=false is `melding` wat Cuescore zelf zei.
async function login(email, wachtwoord) {
  const cookies = {};
  await haal('/login/', cookies); // eerste sessiecookie ophalen (PHPSESSID)

  const body = new URLSearchParams({
    // velden die hun eigen formulier-helper (CSForm) ook meestuurt
    postUrl: '/ajax/user/login.php',
    domPath: '.User .login > form',
    redirect: '', callback: '', hideOnOK: 'true', useSpinner: 'true', cover: '',
    username: email,
    password: wachtwoord,
    remember: 'on', // levert de blijvende `user`-cookie op
    submit: 'Log in',
  });
  const res = await haal('/ajax/user/login.php', cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASIS}/login/`,
      Origin: BASIS,
    },
    body,
  });

  let data = null;
  try { data = JSON.parse(await res.text()); } catch { /* geen JSON = onverwacht antwoord */ }
  const ok = !!data && data.statusCode === 'OK';
  return {
    ok,
    cookies,
    melding: data && data.statusMsg
      ? String(data.statusMsg).replace(/<[^>]+>/g, ' ').trim()
      : 'Cuescore gaf een onverwacht antwoord',
  };
}

// Is deze sessie nog geldig? Uitgelogd geeft dit endpoint {"error":"Please log in to search!"}.
async function sessieGeldig(cookies) {
  try {
    const res = await haal('/ajax/api/get/venue/search/?q=mokum', cookies);
    const data = JSON.parse(await res.text());
    return Array.isArray(data) && data.some((v) => v.venueId === VENUE_ID);
  } catch {
    return false;
  }
}

// Spelers zoeken op naam (voor het kiezen van een tegenstander).
async function zoekSpelers(cookies, zoekterm) {
  const res = await haal(`/ajax/api/get/player/search/?search=${encodeURIComponent(zoekterm)}`, cookies);
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { return []; }
  if (!Array.isArray(data)) return [];

  // Namen zijn NIET onderscheidend: een zoekopdracht op "chris jones" levert dertien
  // spelers op die er in een lijst allemaal identiek uitzien. Daarom geven we alles mee
  // waarmee je ze uit elkaar houdt: foto, land, club/plaats en het speler-id.
  const tekst = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return data.slice(0, 25).map((s) => ({
    playerId: s.playerId,
    naam: s.name || '',
    foto: s.image || null,
    // `country` is bij hen een object, niet een tekst.
    land: (s.country && (tekst(s.country.name) || tekst(s.country.code))) || null,
    vlag: (s.country && tekst(s.country.image)) || null,
    // Club/plaats zit er niet altijd in; meenemen als het er is, anders null.
    club: tekst(s.club && s.club.name) || tekst(s.organization && s.organization.name) || null,
    plaats: tekst(s.city) || tekst(s.placename) || null,
  }));
}

// De echte actie. Retour: { ok, challengeId, matchId, url, melding }.
async function maakChallenge(cookies, { tegenstanderId, tafel, discipline = 3, raceTo = 5, breakrule = 'winner' }) {
  const tableId = TAFELS[Number(tafel)];
  if (!tableId) throw new Error(`onbekende tafel: ${tafel}`);

  const payload = {
    discipline: Number(discipline),
    raceTo: Number(raceTo),
    breakrule: breakrule === 'alternate' ? 'alternate' : 'winner',
    video: '',
    playerBId: Number(tegenstanderId), // speler A ben jij — dat leidt Cuescore uit je sessie af
    venueId: VENUE_ID,
    tableId,
    timezone: 'Europe/Amsterdam',
    resume: false,
  };

  const res = await haal('/ajax/api/set/challenge/create/', cookies, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: `${BASIS}/scoreboard/?code=personal`, Origin: BASIS },
    body: JSON.stringify(payload),
  });

  let data = null;
  try { data = JSON.parse(await res.text()); } catch { /* onverwacht antwoord */ }
  if (!data || !data.success) {
    return { ok: false, melding: (data && data.message) || 'Cuescore gaf een onverwacht antwoord' };
  }
  return {
    ok: true,
    challengeId: data.challengeId,
    matchId: data.matchId,
    url: `${BASIS}/challenge/${data.challengeId}`,
  };
}

module.exports = { login, sessieGeldig, zoekSpelers, maakChallenge, TAFELS, CAMERA_TAFELS, VENUE_ID };
