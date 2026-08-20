const { BlobServiceClient } = require('@azure/storage-blob');

// Dunne helper voor JSON-opslag in Azure Blob Storage. We bewaren de config en het
// schema als losse JSON-blobs (simpel, één bron, makkelijk te seeden) en de
// aangemaakte broadcasts per dag. Zie docs/api-contract.md (interne opslag).

// Connection string: bij voorkeur een eigen STORAGE_CONNECTION, anders de
// standaard AzureWebJobsStorage van de Function App.
function getConnectionString() {
  const cs = process.env.STORAGE_CONNECTION || process.env.AzureWebJobsStorage;
  if (!cs) throw new Error('Geen storage-connectionstring (STORAGE_CONNECTION of AzureWebJobsStorage)');
  return cs;
}

const CONTAINER = process.env.STORAGE_CONTAINER || 'mokum-streams';

const containerClientCache = new Map();

// Zonder naam: de standaardcontainer met onze interne JSON. Met naam: een andere container
// op hetzelfde account — bv. `pauze-posters` (#96), die bewust openbaar leesbaar is en
// dáárom niet met de interne JSON gemengd mag worden.
//
// `createIfNotExists` maakt een container alleen aan als hij ontbreekt en zegt níets over de
// openbare toegang: die staat per container ingesteld en wordt hier niet aangeraakt.
async function getContainerClient(naam = CONTAINER) {
  if (containerClientCache.has(naam)) return containerClientCache.get(naam);
  const service = BlobServiceClient.fromConnectionString(getConnectionString());
  const container = service.getContainerClient(naam);
  await container.createIfNotExists();
  containerClientCache.set(naam, container);
  return container;
}

// ── Korte leescache (vervolg op #101) ─────────────────────────────────────────
// #101 loste de onnodige schrijfacties op, maar readJson() zelf deed nog altijd
// exists() + downloadToBuffer() bij élke aanroep. publicApi.js (o.a. /live, dat in
// één request tot zes blobs leest) wordt continu gepolld door meerdere
// OBS-jumbotron-instanties tegelijk (elke 15s, 24/7, de pc mag altijd aan blijven
// staan) — dat verklaart het leeuwendeel van "Hot Read Operations" en "All Other
// Operations" die #101 nog openliet.
//
// TTL bewust kort (5s): geen enkele automatische beslissing (checkStops,
// liveMatches, ...) draait vaker dan elke 30-60s, dus die kan nooit op data ouder
// dan zijn eigen interval varen. Een schrijf op hetzelfde pad ververst de cache
// meteen, dus een schrijver leest binnen dezelfde instance nooit zijn eigen stale
// waarde terug. updateJson() gebruikt deze cache bewust NIET: die leunt op een
// verse ETag voor optimistische concurrency (tellers) en cachen zou dat breken.
const LEES_CACHE_MS = 5000;
const leesCache = new Map(); // blobPath -> { waarde, verlooptOm }

function cacheZet(blobPath, waarde) {
  leesCache.set(blobPath, { waarde, verlooptOm: Date.now() + LEES_CACHE_MS });
}

// Leest een JSON-blob; geeft `fallback` als de blob niet bestaat.
async function readJson(blobPath, fallback = null) {
  const gecached = leesCache.get(blobPath);
  if (gecached && gecached.verlooptOm > Date.now()) return gecached.waarde;

  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(blobPath);
  if (!(await blob.exists())) {
    cacheZet(blobPath, fallback);
    return fallback;
  }
  const buf = await blob.downloadToBuffer();
  const waarde = JSON.parse(buf.toString('utf8'));
  cacheZet(blobPath, waarde);
  return waarde;
}

// Schrijft een JSON-blob (overschrijft).
async function writeJson(blobPath, obj) {
  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(blobPath);
  const data = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  await blob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
  cacheZet(blobPath, obj);
}

// ── Niet schrijven als er niets verandert (#101) ──────────────────────────────
// Schrijfoperaties op blob-opslag zijn ongeveer tien keer zo duur als leesoperaties, en
// drie timers schreven elke ronde hun blob opnieuw ook als de inhoud identiek was. Bij
// een timer die elke 30 seconden draait zijn dat ~86.000 schrijfacties per maand voor
// niets. Van de €41 per maand ging het leeuwendeel naar opslag-operaties, niet naar de
// Functions zelf.
//
// De vergelijking gebeurt IN HET GEHEUGEN. Zou je de blob eerst teruglezen om te
// vergelijken, dan ruil je een schrijfactie in voor een leesactie in plaats van voor
// niets. De instantie blijft tussen twee timer-tikken warm, dus in de praktijk is de
// vorige vorm gewoon nog bekend.

// De laatst weggeschreven vorm per blob-pad. Bewust niet begrensd: het gaat om een
// handvol vaste paden, geen groeiende sleutelruimte.
const laatstGeschreven = new Map();

// Vergelijkbare vorm van een object: JSON, met de opgegeven velden eruit gefilterd.
// Los exporteerbaar zodat de logica te testen is zonder Azure. `negeer` is nodig voor
// velden die per definitie elke ronde veranderen, zoals een tijdstempel — anders is er
// altijd verschil en schrijf je alsnog elke keer.
function vergelijkbareVorm(obj, negeer = []) {
  const weg = new Set(negeer);
  return JSON.stringify(obj, (sleutel, waarde) => (weg.has(sleutel) ? undefined : waarde));
}

// Schrijft alleen als de inhoud afwijkt van wat wij er als laatste in zetten.
// Retourneert true als er echt geschreven is.
//
// LET OP: dit klopt alleen zolang ÉÉN schrijver een blob beheert. Komt er ooit een tweede
// bij, dan denkt deze cache ten onrechte dat de opslag nog gelijk is aan onze laatste vorm
// en verdwijnt een update. Bij een koude start is de cache leeg en wordt er één keer
// geschreven — de opslag blijft dus de waarheid.
async function writeJsonAlsGewijzigd(blobPath, obj, { negeer = [] } = {}) {
  const vorm = vergelijkbareVorm(obj, negeer);
  if (laatstGeschreven.get(blobPath) === vorm) return false;
  await writeJson(blobPath, obj);
  laatstGeschreven.set(blobPath, vorm);
  return true;
}

// Verwijdert een blob. Bestaat 'ie niet, dan is dat geen fout — het doel (weg) is bereikt.
// Nodig voor "koppeling verbreken" (#90): daar moet het opgeslagen geheim écht weg zijn en
// niet achterblijven met een vlaggetje erop.
async function deleteBlob(blobPath) {
  const container = await getContainerClient();
  await container.getBlockBlobClient(blobPath).deleteIfExists();
  leesCache.delete(blobPath);
}

// Lees-wijzig-schrijf met optimistische concurrency (ETag). `updater(huidig)` geeft
// het nieuwe object terug; we schrijven alleen als de blob sinds het lezen niet is
// gewijzigd (ifMatch), anders lezen we opnieuw en proberen we het nog eens. Nodig voor
// tellers e.d. waar twee gelijktijdige schrijvers elkaars increment zouden overschrijven.
async function updateJson(blobPath, updater, fallback = null, retries = 6) {
  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(blobPath);
  for (let poging = 0; ; poging++) {
    let huidig = fallback;
    let conditions;
    if (await blob.exists()) {
      const props = await blob.getProperties();
      const buf = await blob.downloadToBuffer();
      huidig = JSON.parse(buf.toString('utf8'));
      conditions = { ifMatch: props.etag }; // alleen schrijven als onveranderd
    } else {
      conditions = { ifNoneMatch: '*' }; // alleen aanmaken als 'ie nog niet bestaat
    }
    const volgende = updater(huidig);
    const data = Buffer.from(JSON.stringify(volgende, null, 2), 'utf8');
    try {
      await blob.upload(data, data.length, {
        blobHTTPHeaders: { blobContentType: 'application/json' },
        conditions,
      });
      cacheZet(blobPath, volgende);
      return volgende;
    } catch (e) {
      const code = e.statusCode || (e.details && e.details.errorCode);
      if ((code === 412 || code === 409 || code === 'ConditionNotMet' || code === 'BlobAlreadyExists') && poging < retries) {
        continue; // botsing met een gelijktijdige schrijver → opnieuw
      }
      throw e;
    }
  }
}

module.exports = {
  readJson, writeJson, writeJsonAlsGewijzigd, vergelijkbareVorm,
  updateJson, deleteBlob, getContainerClient, CONTAINER,
};
