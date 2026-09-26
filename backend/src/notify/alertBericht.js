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

// Alarm als een tafel als gestopt geregistreerd staat, maar de agent na meerdere stopcommando's
// nog steeds zendt (#113, 23-08: tafel 15 negeerde een expliciet stopcommando). De uitzending
// loopt dan onbewaakt door op YouTube tot iemand ingrijpt.
function bouwStopFalenAlert({ tableNumber, tournamentName, videoId, pogingen }) {
  const naam = tournamentName || 'onbekend toernooi';
  const onderwerp = `⚠ Tafel ${tableNumber} blijft zenden na stop — ${naam}`;
  const studioLink = videoId ? `https://studio.youtube.com/video/${videoId}/livestreaming` : null;
  const regels = [
    `Tafel ${tableNumber} (${naam}) staat als gestopt geregistreerd, maar zendt na ${pogingen} stopcommando's nog steeds.`,
    "De uitzending loopt onbewaakt door op YouTube. Stop OBS op de streaming-pc met de hand (via Tailscale/RustDesk) en controleer of de agent commando's ontvangt.",
  ];
  if (studioLink) regels.push(`YouTube Studio: ${studioLink}`);
  return { onderwerp, tekst: regels.join('\n') };
}

// Alarm als de agent zegt dat OBS zendt, maar YouTube de uitzending ruim na de geplande start
// nog niet live heeft gezet (#131, 16-09: tafel 3 bleef uren op 'Upcoming', beeld zwart). Kijkers
// zien niets, terwijl alles aan onze kant er goed uitziet.
function bouwNietLiveOpYoutubeAlert({ tableNumber, tournamentName, videoId, wachtMin }) {
  const naam = tournamentName || 'onbekend toernooi';
  const onderwerp = `⚠ Tafel ${tableNumber} zendt, maar staat niet live op YouTube — ${naam}`;
  const studioLink = videoId ? `https://studio.youtube.com/video/${videoId}/livestreaming` : null;
  const regels = [
    `OBS zendt op tafel ${tableNumber} (${naam}), maar YouTube heeft de uitzending ${wachtMin} minuten na de geplande start nog niet live gezet. Kijkers zien niets.`,
    'Meest waarschijnlijk hangt de nieuwe uitzending aan een stream key die al actief was. Open YouTube Studio: staat de uitzending op "Upcoming"? Stop en start dan de stream van deze tafel opnieuw (dashboard: stop, wacht even, start).',
  ];
  if (studioLink) regels.push(`YouTube Studio: ${studioLink}`);
  return { onderwerp, tekst: regels.join('\n') };
}

// Klokkijk-formattering voor de agent-meldingen (Amsterdamse tijd), zodat "sinds 02:16" klopt.
function tijdAmsterdam(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'onbekend';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// Alarm als de agent (OBS-pc) niets meer laat horen (#132, 17-09: pc viel om 02:16 weg en
// werd pas om 10:00 ontdekt). Dit is een storing buiten een geplande stream om.
function bouwAgentOfflineAlert({ lastSeen, duurMin }) {
  const onderwerp = '⚠ OBS-pc is offline';
  const regels = [
    `De agent op de OBS-pc laat al ${duurMin} minuten niets horen (laatst gezien: ${tijdAmsterdam(lastSeen)}).`,
    'Checklist: staat de pc aan (stroom, sleepstand)? Is er internet? Draait de agent-taak? Zie docs/obs-herstel-runbook.md voor de stappen.',
    'Zolang de pc offline is, kunnen er geen streams starten of stoppen.',
  ];
  return { onderwerp, tekst: regels.join('\n') };
}

// Herstelmelding: de agent is weer online na een eerder alarm.
function bouwAgentHerstelAlert({ sindsLastSeen }) {
  return {
    onderwerp: '✅ OBS-pc is weer online',
    tekst: `De agent meldt zich weer (was weg sinds ${tijdAmsterdam(sindsLastSeen)}).`,
  };
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

module.exports = { bouwStreamFalenAlert, bouwStopFalenAlert, bouwNietLiveOpYoutubeAlert, bouwAgentOfflineAlert, bouwAgentHerstelAlert, bouwBroadcastLimietAlert };
