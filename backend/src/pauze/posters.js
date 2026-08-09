// Pure logica voor de posters in de pauzerotatie (#96). Géén netwerk → volledig
// unit-testbaar. De netwerklaag (`functions/pauzePosters.js`) somt de blobs op en levert ze
// hier aan; hier bepalen we welke vandaag mogen draaien en in welke volgorde.
//
// Een poster is een afbeelding in de container `pauze-posters`. De besturing zit in de
// blob-metadata, in te stellen in de Azure Portal zonder het bestand te hernoemen:
//
//   tot       laatste dag dat de poster meedraait   (2026-09-01)
//   van       eerste dag, om vooruit te uploaden    (2026-08-20)
//   volgorde  plek in de rotatie, oplopend          (1)
//
// Grondregel bij twijfel: TONEN. Ontbreekt `tot`, of staat er iets onleesbaars in, dan blijft
// de poster hangen. Een poster die te lang hangt zie je en repareer je; een poster die
// stilletjes verdwijnt merkt niemand op — en dan staat er een avond lang niets in beeld.

// Alleen echte afbeeldingen; er kan altijd rommel in een container belanden.
const AFBEELDING_RE = /\.(png|jpe?g|webp|avif)$/i;

// 'YYYY-MM-DD' → vergelijkbaar getal, of null als het geen geldige datum is. We vergelijken
// als tekst-datum (niet als Date) zodat er geen tijdzone-verschuiving in kan sluipen: `tot`
// is een dag in de zaal, geen tijdstip.
function datumSleutel(waarde) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(waarde || '').trim());
  if (!m) return null;
  const [, jaar, mnd, dag] = m;
  const n = Number(jaar) * 10000 + Number(mnd) * 100 + Number(dag);
  // Grove controle op onzin als 2026-13-45; exacte maandlengtes doen er niet toe voor een
  // groter-dan-vergelijking.
  if (Number(mnd) < 1 || Number(mnd) > 12 || Number(dag) < 1 || Number(dag) > 31) return null;
  return n;
}

// De dag van vandaag in de zaal-tijdzone, als 'YYYY-MM-DD'. Belangrijk bij een avondpauze:
// om 00:30 lokaal is het in UTC nog de vorige dag, en dan zou een poster met `tot` van
// gisteren nog een halve nacht doordraaien.
function vandaagAmsterdam(now = new Date(), tz = 'Europe/Amsterdam') {
  const delen = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const pak = (t) => (delen.find((p) => p.type === t) || {}).value || '';
  return `${pak('year')}-${pak('month')}-${pak('day')}`;
}

// Mag deze poster vandaag draaien? `van`/`tot` zijn inclusief: op de dag die in `tot` staat
// is de poster nog te zien, de dag erna niet meer.
function isGeldigOp(meta, vandaag) {
  const nu = datumSleutel(vandaag);
  if (nu == null) return true;                       // onbekende 'vandaag' → niet gaan filteren
  const van = datumSleutel(meta && meta.van);
  const tot = datumSleutel(meta && meta.tot);
  if (van != null && nu < van) return false;
  if (tot != null && nu > tot) return false;
  return true;
}

// Bouwt de lijst voor het endpoint uit ruwe blobs.
//
// `blobs` = [{ naam, url, metadata }], `vandaag` = 'YYYY-MM-DD' (zie vandaagAmsterdam).
// Retour: [{ naam, url, tot, volgorde }] — gesorteerd op volgorde, daarna op bestandsnaam
// zodat de rotatie elke dag dezelfde is en niet afhangt van hoe Azure de blobs teruggeeft.
function bouwPosters(blobs, vandaag) {
  return (blobs || [])
    .filter((b) => b && b.naam && AFBEELDING_RE.test(b.naam))
    .filter((b) => isGeldigOp(b.metadata, vandaag))
    .map((b) => {
      const m = b.metadata || {};
      const volgorde = Number(m.volgorde);
      return {
        naam: b.naam,
        url: b.url,
        tot: datumSleutel(m.tot) != null ? String(m.tot).trim() : null,
        volgorde: Number.isFinite(volgorde) ? volgorde : null,
      };
    })
    .sort((a, b) => {
      // Zonder volgorde achteraan, zodat een nieuwe poster zonder metadata de bestaande
      // rotatie niet omgooit.
      const va = a.volgorde == null ? Number.MAX_SAFE_INTEGER : a.volgorde;
      const vb = b.volgorde == null ? Number.MAX_SAFE_INTEGER : b.volgorde;
      return va - vb || a.naam.localeCompare(b.naam);
    });
}

module.exports = { bouwPosters, isGeldigOp, datumSleutel, vandaagAmsterdam, AFBEELDING_RE };
