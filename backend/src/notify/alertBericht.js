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

// Alarm bij de noodrem op het aanmaken van broadcasts (#128). Gaat af als één tafel op
// één dag onverwacht vaak opnieuw geclaimd wordt — het patroon van 16-09, toen twee
// planning-records voor hetzelfde toernooi elkaar de tafel afhandig maakten en er vier
// broadcasts in een kwartier ontstonden. Dat is niets wat de automatisering zelf kan
// oplossen, dus er moet iemand naar kijken.
function bouwBroadcastLimietAlert({ tableNumber, naam, gemaakt }) {
  const toernooi = naam || 'onbekend toernooi';
  const onderwerp = `⚠ Tafel ${tableNumber} maakt steeds nieuwe uitzendingen aan`;
  const regels = [
    `Voor tafel ${tableNumber} zijn vandaag al ${gemaakt} uitzendingen aangemaakt (laatste poging: "${toernooi}").`,
    'De noodrem staat nu aan: er worden voor deze tafel geen nieuwe uitzendingen meer gemaakt.',
    'Meestal staan er twee planning-records voor hetzelfde toernooi in de Toernooi planner. Controleer die en gooi de dubbele weg.',
  ];
  return { onderwerp, tekst: regels.join('\n') };
}

module.exports = { bouwStreamFalenAlert, bouwBroadcastLimietAlert };
