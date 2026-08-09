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

// Leest een JSON-blob; geeft `fallback` als de blob niet bestaat.
async function readJson(blobPath, fallback = null) {
  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(blobPath);
  if (!(await blob.exists())) return fallback;
  const buf = await blob.downloadToBuffer();
  return JSON.parse(buf.toString('utf8'));
}

// Schrijft een JSON-blob (overschrijft).
async function writeJson(blobPath, obj) {
  const container = await getContainerClient();
  const blob = container.getBlockBlobClient(blobPath);
  const data = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  await blob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

// Verwijdert een blob. Bestaat 'ie niet, dan is dat geen fout — het doel (weg) is bereikt.
// Nodig voor "koppeling verbreken" (#90): daar moet het opgeslagen geheim écht weg zijn en
// niet achterblijven met een vlaggetje erop.
async function deleteBlob(blobPath) {
  const container = await getContainerClient();
  await container.getBlockBlobClient(blobPath).deleteIfExists();
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

module.exports = { readJson, writeJson, updateJson, deleteBlob, getContainerClient, CONTAINER };
