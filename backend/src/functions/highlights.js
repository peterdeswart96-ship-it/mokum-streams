const { app } = require('@azure/functions');
const { isAdmin } = require('../admin/auth');
const { readJson, updateJson } = require('../storage/blob');
const { runoutsUitArchief } = require('../video/archief');
const { zetKeuring, metKeuring, goedgekeurd, tel, clipSleutel } = require('../public/keuring');

// Highlight-clips en hun keuring (#71).
//
//  GET  /api/highlights                 (publiek) → alleen GOEDGEKEURDE clips, voor de uitzending
//  GET  /api/manage/highlights          (admin)   → ALLE clips met hun oordeel, voor de keuringspagina
//  POST /api/manage/highlights          (admin)   → body { sleutel, status } met status
//                                                   'goed' | 'afgekeurd' | null (= terugdraaien)
//
// Niet elke run-out levert bruikbaar beeld op (pauzescherm in beeld, camera verkeerd), dus
// de uitzending speelt uitsluitend wat vooraf is goedgekeurd.

const PAD = 'highlight-keuring.json';
const CORS_ALLOWLIST = new Set([
  'https://mokum-streams.pdscloud.nl',
  'http://localhost:5173',
  'http://localhost:4173',
]);
function corsHeaders(request) {
  const origin = request && request.headers && request.headers.get('origin');
  return origin && CORS_ALLOWLIST.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}
const json = (status, body, request) => ({ status, jsonBody: body, headers: corsHeaders(request) });

// Alle run-outs waar een clipvenster bij zit — zonder venster valt er niets af te spelen.
async function clips() {
  const archief = (await readJson('archief.json', [])) || [];
  return runoutsUitArchief(archief).filter((r) => r.clipVan != null && r.clipTot != null);
}

app.http('publicHighlights', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'highlights',
  handler: async (request) => {
    const keuring = (await readJson(PAD, {})) || {};
    const alle = await clips();
    const items = goedgekeurd(alle, keuring);
    const gevraagd = Number(request.query.get('limit'));
    return json(200, {
      generatedAt: new Date().toISOString(),
      aantal: items.length,
      ...tel(alle, keuring),
      items: Number.isFinite(gevraagd) && gevraagd > 0 ? items.slice(0, gevraagd) : items,
    }, request);
  },
});

app.http('adminHighlights', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/highlights',
  handler: async (request) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' }, request);
    const keuring = (await readJson(PAD, {})) || {};
    const alle = await clips();
    return json(200, { ...tel(alle, keuring), items: metKeuring(alle, keuring) }, request);
  },
});

app.http('adminHighlightsKeur', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/highlights',
  handler: async (request, context) => {
    if (!isAdmin(request)) return json(401, { error: 'niet geautoriseerd' }, request);
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'ongeldige of lege JSON' }, request); }
    const sleutel = body && body.sleutel;
    if (!sleutel) return json(400, { error: 'sleutel ontbreekt' }, request);

    const nu = new Date().toISOString();
    const nieuw = await updateJson(PAD, (huidig) => zetKeuring(huidig, sleutel, body.status, nu), {});
    context.log(`[highlights] ${sleutel} → ${body.status || 'ongekeurd'}`);
    const alle = await clips();
    return json(200, { ok: true, sleutel, status: (nieuw[sleutel] && nieuw[sleutel].status) || null, ...tel(alle, nieuw) }, request);
  },
});

module.exports = { clipSleutel };
