const { google } = require('googleapis');
const { getYouTubeSecrets } = require('./secrets');

// Bouwt een geauthenticeerde YouTube Data API v3-client.
//
// We gebruiken het OAuth2-refresh-token van het Mokum-kanaal
// (pooleninmokum@gmail.com). Omdat de OAuth-app op "In production" staat, blijft
// dat refresh-token geldig; de googleapis-client ververst zelf de kortlevende
// access-tokens wanneer nodig. We hoeven dus alleen het refresh-token te leveren.

let cachedClient = null;

async function getYouTubeClient() {
  if (cachedClient) return cachedClient;

  const { clientId, clientSecret, refreshToken } = await getYouTubeSecrets();

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  cachedClient = google.youtube({ version: 'v3', auth: oauth2 });
  return cachedClient;
}

module.exports = { getYouTubeClient };
