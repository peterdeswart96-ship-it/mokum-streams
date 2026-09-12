// Pure tekst-opbouw voor het "stream niet live"-alarm (12-09-incident). Géén netwerk →
// unit-testbaar. De verzendkant (mail/ntfy) zit in verzenden.js.

// Kort genoeg voor een ntfy-pushmelding, volledig genoeg voor een e-mailonderwerp.
function bouwStreamFalenAlert({ tableNumber, tournamentName, videoId, pogingen }) {
  const naam = tournamentName || 'onbekend toernooi';
  const onderwerp = `⚠ Tafel ${tableNumber} niet live — ${naam}`;
  const studioLink = videoId ? `https://studio.youtube.com/video/${videoId}/livestreaming` : null;
  const regels = [
    `Tafel ${tableNumber} (${naam}) is na ${pogingen} automatische pogingen nog steeds niet live gegaan.`,
    'Checklist: staat de OBS-pc aan en is OBS geopend? Geeft de camera beeld? Is de agent online (dashboard)?',
  ];
  if (studioLink) regels.push(`YouTube Studio: ${studioLink}`);
  return { onderwerp, tekst: regels.join('\n') };
}

module.exports = { bouwStreamFalenAlert };
