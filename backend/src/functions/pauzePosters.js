const { app } = require('@azure/functions');
const { readJson, writeJson, getContainerClient } = require('../storage/blob');
const { bouwPosters, vandaagAmsterdam } = require('../pauze/posters');

// Posters voor de pauzerotatie (#96):
//   GET /api/pauze/posters → { generatedAt, posters: [{ naam, url, tot, volgorde }] }
//
// Bron is de container `pauze-posters`, die blob-niveau openbaar leesbaar is: de URL's in het
// antwoord kan de browserbron in OBS rechtstreeks ophalen. Het OPSOMMEN gebeurt hier, met de
// connectionstring — van buitenaf is de container niet te listen.
//
// Het filteren op `van`/`tot` gebeurt bewust hier en niet in de browser: de pauzekaart hoeft
// dan niets van datums te weten, en aan dit antwoord zie je meteen wat er hoort te draaien.
//
// Server-cache in blob `posters.json` (~30 min). Vier OBS-instanties vragen dit tegelijk op;
// zonder cache is dat vier keer een container-listing per verversing (vgl. #94).

const POSTER_CONTAINER = process.env.POSTER_CONTAINER || 'pauze-posters';
const PAD = 'posters.json';
const VERS_MS = 30 * 60 * 1000;

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

// Somt de container op. `includeMetadata` is nodig, anders komt `tot`/`volgorde` niet mee.
// De URL bouwen we uit `container.url` en niet uit een hardgecodeerde accountnaam, zodat dit
// blijft werken als het opslagaccount ooit verhuist.
async function leesContainer() {
  const container = await getContainerClient(POSTER_CONTAINER);
  const blobs = [];
  for await (const b of container.listBlobsFlat({ includeMetadata: true })) {
    blobs.push({
      naam: b.name,
      url: `${container.url}/${encodeURIComponent(b.name)}`,
      metadata: b.metadata || {},
    });
  }
  return blobs;
}

async function bouw(now) {
  const blobs = await leesContainer();
  return {
    generatedAt: now.toISOString(),
    posters: bouwPosters(blobs, vandaagAmsterdam(now)),
  };
}

app.http('publicPauzePosters', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pauze/posters',
  handler: async (request, context) => {
    const now = new Date();
    let data = await readJson(PAD, null);

    // De cache is ook verlopen als hij van gisteren is: anders blijft een poster die om
    // middernacht afloopt nog tot een half uur na de datumgrens in beeld.
    const zelfdeDag = data && data.generatedAt
      && vandaagAmsterdam(new Date(data.generatedAt)) === vandaagAmsterdam(now);
    const vers = zelfdeDag && (now - new Date(data.generatedAt) < VERS_MS);

    if (!vers) {
      try {
        data = await bouw(now);
        await writeJson(PAD, data);
        context.log(`[posters] herbouwd: ${data.posters.length} geldig`);
        if (!data.posters.length) {
          context.log('[WAARSCHUWING] [posters] geen enkele geldige poster — de pauzerotatie slaat de poster-fase over');
        }
      } catch (e) {
        context.log(`[posters] herbouw mislukt: ${e.message}`);
        if (!data) return json(502, { error: 'posters ophalen mislukt', posters: [] }, request);
        // Anders: serveer de (verlopen) cache — beter oud dan leeg.
      }
    }
    return json(200, data, request);
  },
});
