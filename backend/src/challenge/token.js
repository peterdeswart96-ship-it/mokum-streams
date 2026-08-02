const crypto = require('node:crypto');

// Ons eigen sessietoken voor leden (#90).
//
// Een lid logt in met zijn Cuescore-gegevens; wij controleren die bij Cuescore en geven
// daarna dit token terug. Zijn telefoon stuurt het mee bij elke volgende aanvraag, zodat
// hij niet steeds opnieuw hoeft in te loggen.
//
// Bewust géén JWT-bibliotheek: we hebben drie velden en een handtekening nodig, en een
// afhankelijkheid minder is een afhankelijkheid minder. Vorm: <payload>.<handtekening>,
// beide base64url. HMAC-SHA256 met een geheim uit de app-instellingen.

const GELDIG_DAGEN = 90;

function geheim() {
  // Valt terug op de hoofdsleutel: die is er toch al en is even geheim. Een apart
  // token-geheim mag, maar hoeft niet — daarom optioneel.
  const s = process.env.CHALLENGE_TOKEN_SECRET || process.env.CHALLENGE_MASTER_KEY;
  if (!s) throw new Error('CHALLENGE_TOKEN_SECRET of CHALLENGE_MASTER_KEY ontbreekt');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function onderteken(data, s = geheim()) {
  return crypto.createHmac('sha256', s).update(data).digest('base64url');
}

// ledId = wie het is (zie ledId() hieronder); verlooptOp = wanneer het token ongeldig wordt.
function maakToken(ledId, { nu = new Date(), dagen = GELDIG_DAGEN, s = geheim() } = {}) {
  if (!ledId || typeof ledId !== 'string') throw new Error('ledId ontbreekt');
  const payload = b64url(JSON.stringify({
    ledId,
    verlooptOp: new Date(nu.getTime() + dagen * 86400000).toISOString(),
  }));
  return `${payload}.${onderteken(payload, s)}`;
}

// Retour: { ledId } of null. Nooit gooien — een kapot token is een 401, geen 500.
function leesToken(token, { nu = new Date(), s = geheim() } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, handtekening] = token.split('.');
  if (!payload || !handtekening) return null;

  // timingSafeEqual vergelijkt in vaste tijd, zodat je de handtekening niet byte voor byte
  // kunt raden aan de hand van de responstijd.
  const verwacht = Buffer.from(onderteken(payload, s));
  const gekregen = Buffer.from(handtekening);
  if (verwacht.length !== gekregen.length || !crypto.timingSafeEqual(verwacht, gekregen)) return null;

  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.ledId !== 'string' || !data.ledId) return null;
  if (!data.verlooptOp || Date.parse(data.verlooptOp) <= nu.getTime()) return null;
  return { ledId: data.ledId };
}

// Sleutel van een lid = hash van het e-mailadres. Zo hoeven we niet eerst uit te zoeken
// welk Cuescore-speler-id erbij hoort (dat staat alleen in een HTML-pagina), en staat het
// e-mailadres niet in de bestandsnaam in de opslag.
function ledId(email) {
  return crypto.createHash('sha256')
    .update(String(email || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

// Haalt het token uit een Authorization-header.
function tokenUitRequest(request) {
  const h = (request.headers.get && request.headers.get('authorization')) || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

module.exports = { maakToken, leesToken, tokenUitRequest, ledId, GELDIG_DAGEN };
