const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

// Haalt de YouTube-OAuth-secrets op.
//
// Twee bronnen, in deze volgorde:
//  1. Lokale ontwikkeling: env-vars (YOUTUBE_CLIENT_ID/_SECRET/_REFRESH_TOKEN).
//     Zo kun je zonder Azure-toegang draaien. Zet ze in local.settings.json
//     (die staat in .gitignore) of in je shell.
//  2. Productie in Azure: Key Vault `kv-mokum-streams`, uitgelezen met de
//     managed identity van de Function App via DefaultAzureCredential.
//
// De secretwaarden komen NOOIT in code, repo of logging (CLAUDE.md-regel 4).

const KEY_VAULT_NAME = process.env.KEY_VAULT_NAME || 'kv-mokum-streams';

// Namen van de secrets in Key Vault (zie docs/google-cloud-setup.md).
const SECRET_NAMES = {
  clientId: 'youtube-client-id',
  clientSecret: 'youtube-client-secret',
  refreshToken: 'youtube-refresh-token',
};

// De secrets veranderen zelden; we cachen ze per proces om Key Vault-calls te sparen.
let cached = null;

async function getYouTubeSecrets() {
  if (cached) return cached;

  // 1. Env-vars hebben voorrang (lokale ontwikkeling).
  const fromEnv = {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
  };
  if (fromEnv.clientId && fromEnv.clientSecret && fromEnv.refreshToken) {
    cached = fromEnv;
    return cached;
  }

  // 2. Anders: uit Key Vault.
  const vaultUrl = `https://${KEY_VAULT_NAME}.vault.azure.net`;
  const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    client.getSecret(SECRET_NAMES.clientId),
    client.getSecret(SECRET_NAMES.clientSecret),
    client.getSecret(SECRET_NAMES.refreshToken),
  ]);

  cached = {
    clientId: clientId.value,
    clientSecret: clientSecret.value,
    refreshToken: refreshToken.value,
  };
  return cached;
}

module.exports = { getYouTubeSecrets, SECRET_NAMES };
