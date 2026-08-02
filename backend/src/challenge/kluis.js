const crypto = require('node:crypto');

// Versleuteling van Cuescore-wachtwoorden van leden (#90).
//
// WAAROM DIT ANDERS IS DAN GEWONE WACHTWOORDOPSLAG
// Bij een eigen inlogsysteem hoor je wachtwoorden te HASHEN: eenrichtingsverkeer, je kunt
// ze er nooit meer uit halen. Dat kan hier niet. Wij moeten het wachtwoord opnieuw kunnen
// gebruiken om namens het lid bij Cuescore in te loggen, dus het moet ontsleutelbaar zijn.
//
// Dat betekent dat wie én deze opslag én de sleutel te pakken krijgt, de Cuescore-accounts
// van alle leden heeft. De sleutel staat daarom NIET in de code en niet in de repo, maar in
// Key Vault, en komt via een app-instelling binnen. Bewuste afweging van Peter (02-08); de
// alternatieven staan in docs/cuescore-challenge.md.
//
// AES-256-GCM: versleutelt én verzegelt. Bij een gewijzigd cijfertekst-byte weigert het
// ontsleutelen in plaats van rommel terug te geven.

const ALGORITME = 'aes-256-gcm';
const SLEUTEL_BYTES = 32; // 256 bits
const IV_BYTES = 12;      // standaard voor GCM

const SECRET_NAAM = 'challenge-master-key';

function controleer(rauw, bron) {
  const sleutel = Buffer.from(rauw, 'base64');
  if (sleutel.length !== SLEUTEL_BYTES) {
    throw new Error(`${bron} moet ${SLEUTEL_BYTES} bytes zijn (base64), is ${sleutel.length}`);
  }
  return sleutel;
}

// De hoofdsleutel uit de omgeving (lokale ontwikkeling en tests).
// Bewust lui: zo start de Function App ook als deze functie niet gebruikt wordt.
function hoofdsleutel() {
  const rauw = process.env.CHALLENGE_MASTER_KEY;
  if (!rauw) throw new Error('CHALLENGE_MASTER_KEY ontbreekt — zie docs/cuescore-challenge.md');
  return controleer(rauw, 'CHALLENGE_MASTER_KEY');
}

// Dezelfde twee bronnen als bij de YouTube-secrets (src/youtube/secrets.js): eerst een
// env-var zodat je lokaal kunt draaien zonder Azure-toegang, anders Key Vault via de
// managed identity van de Function App. Gecachet per proces — de sleutel verandert nooit.
let gecachet = null;
async function haalSleutel() {
  if (gecachet) return gecachet;
  if (process.env.CHALLENGE_MASTER_KEY) {
    gecachet = hoofdsleutel();
    return gecachet;
  }
  const { SecretClient } = require('@azure/keyvault-secrets');
  const { DefaultAzureCredential } = require('@azure/identity');
  const naam = process.env.KEY_VAULT_NAME || 'kv-mokum-streams';
  const client = new SecretClient(`https://${naam}.vault.azure.net`, new DefaultAzureCredential());
  const secret = await client.getSecret(SECRET_NAAM);
  gecachet = controleer(secret.value, SECRET_NAAM);
  return gecachet;
}

// Retour: { iv, tag, data } — alle drie base64. Elke keer een nieuwe IV, dus twee leden met
// hetzelfde wachtwoord leveren verschillende cijfertekst op.
function versleutel(klaretekst, sleutel = hoofdsleutel()) {
  if (typeof klaretekst !== 'string' || !klaretekst) throw new Error('niets om te versleutelen');
  const iv = crypto.randomBytes(IV_BYTES);
  const c = crypto.createCipheriv(ALGORITME, sleutel, iv);
  const data = Buffer.concat([c.update(klaretekst, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

// Gooit als de sleutel niet klopt of er aan de data is gesleuteld — nooit stilzwijgend
// onzin teruggeven.
function ontsleutel(geheim, sleutel = hoofdsleutel()) {
  if (!geheim || !geheim.iv || !geheim.tag || !geheim.data) throw new Error('onvolledig geheim');
  const d = crypto.createDecipheriv(ALGORITME, sleutel, Buffer.from(geheim.iv, 'base64'));
  d.setAuthTag(Buffer.from(geheim.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(geheim.data, 'base64')), d.final()]).toString('utf8');
}

// Hulpje om een verse hoofdsleutel te maken (eenmalig, bij het inrichten).
const nieuweHoofdsleutel = () => crypto.randomBytes(SLEUTEL_BYTES).toString('base64');

module.exports = { versleutel, ontsleutel, nieuweHoofdsleutel, hoofdsleutel, haalSleutel, SECRET_NAAM };
