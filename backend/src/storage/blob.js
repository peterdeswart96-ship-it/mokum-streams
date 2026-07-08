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

let containerClientCache = null;

async function getContainerClient() {
  if (containerClientCache) return containerClientCache;
  const service = BlobServiceClient.fromConnectionString(getConnectionString());
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  containerClientCache = container;
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

module.exports = { readJson, writeJson, getContainerClient, CONTAINER };
