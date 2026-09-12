// Netwerklaag voor het "stream niet live"-alarm (12-09-incident): een e-mail én een
// ntfy-pushmelding, allebei best-effort — als één kanaal faalt, mag dat het andere niet
// tegenhouden. Géén pure logica hier (zie alertBericht.js daarvoor).
//
// Configuratie via Azure app settings (NOOIT in code/repo, werkafspraak 4):
//   ALERT_SMTP_GEBRUIKER / ALERT_SMTP_WACHTWOORD  — Gmail-adres + app-wachtwoord (geen
//     accountwachtwoord) waarmee de alarmmail verstuurd wordt.
//   ALERT_ONTVANGERS                              — kommagescheiden e-mailadressen.
//   NTFY_TOPIC                                    — het ntfy.sh-topic (of eigen server
//     via NTFY_SERVER, standaard https://ntfy.sh). Zonder topic wordt ntfy overgeslagen.
// Ontbreekt de mailconfiguratie, dan wordt mail overgeslagen (niet gegooid) — hetzelfde
// idee als ontbrekende ntfy-config: een half werkend alarm is beter dan een crashende timer.

const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.ALERT_SMTP_GEBRUIKER;
  const pass = process.env.ALERT_SMTP_WACHTWOORD;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return transporter;
}

async function stuurAlertMail({ onderwerp, tekst }) {
  const ontvangers = String(process.env.ALERT_ONTVANGERS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const t = getTransporter();
  if (!t || !ontvangers.length) return { verstuurd: false, reden: 'geen mailconfiguratie' };
  await t.sendMail({
    from: `Mokum Streams <${process.env.ALERT_SMTP_GEBRUIKER}>`,
    to: ontvangers.join(', '),
    subject: onderwerp,
    text: tekst,
  });
  return { verstuurd: true };
}

async function stuurAlertNtfy({ onderwerp, tekst }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { verstuurd: false, reden: 'geen NTFY_TOPIC ingesteld' };
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  const res = await fetch(`${server.replace(/\/$/, '')}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      Title: onderwerp,
      Priority: 'high',
      Tags: 'warning',
    },
    body: tekst,
  });
  if (!res.ok) throw new Error(`ntfy gaf ${res.status}`);
  return { verstuurd: true };
}

// Stuurt beide kanalen onafhankelijk van elkaar; retourneert per kanaal wat er gebeurde
// zodat de caller het (bij falen) kan loggen zonder de hele ronde te laten crashen.
async function stuurAlert(bericht) {
  const resultaat = { mail: null, ntfy: null };
  try {
    resultaat.mail = await stuurAlertMail(bericht);
  } catch (e) {
    resultaat.mail = { verstuurd: false, reden: e.message };
  }
  try {
    resultaat.ntfy = await stuurAlertNtfy(bericht);
  } catch (e) {
    resultaat.ntfy = { verstuurd: false, reden: e.message };
  }
  return resultaat;
}

module.exports = { stuurAlert, stuurAlertMail, stuurAlertNtfy };
