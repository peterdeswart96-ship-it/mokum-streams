# Cuescore-overlays & API — onderzoek (2026-07-11)

> Onderzoek naar wat Cuescore zélf biedt voor stream-overlays, n.a.v. het vermoeden
> dat er meer mogelijk is dan wat we nu gebruiken. **Kernconclusie:** Cuescore heeft
> een **officiële scoreboard-overlay** (met organisatielogo, spelersfoto's, vlaggen,
> innings/averages, huisstijlkleur) én een **JSON-API** — beide krachtiger dan het
> losse `pixelgrid/miscuescore`-tool dat we nu in OBS gebruiken.

## Wat we nu gebruiken
- OBS-bron `Scoreboard` (+ `Scores other tables`) = **browser-source** naar het
  **derde-partij**-tool `https://pixelgrid.github.io/miscuescore/?t=<tableId>`
  (per tafel; tableId 1=61403749, 3=61403764, 15=61403800, 16=61403803).
- Dit tool bootst de Cuescore-overlay na, maar is niet van Cuescore zelf en we weten
  z'n opties niet volledig.

## 1) Officiële Cuescore scoreboard-overlay ⭐
**URL-vorm:** `https://cuescore.com/scoreboard/overlay/?tableId=<ID>&lang=<code>`
Voorbeeld uit de docs: `…/scoreboard/overlay/?tableId=1167880&lang=nb`

**Toont (automatisch, zonder handmatig wisselen):**
- **Linksboven:** organisatielogo, toernooidata, toernooinaam, locatie (venue) en discipline.
- **Onderin/midden:** live scorebord met **spelersnamen, profielfoto's van beide
  spelers, nationaliteitsvlaggen**, stand, tafelnummer, race-to, ronde, en
  **innings + averages** (bij disciplines waar dat speelt).
- **Huisstijl:** gebruikt automatisch de **hoofdkleur van de organisatie** (anders
  grijze gradient).
- **Transparant** ontworpen → dekt het hele beeld zonder het laken te blokkeren.
- **Auto-update** elke ~10 sec; overlay weet zelf wanneer een wedstrijd loopt
  (verschijnt pas bij matchstart, verdwijnt erna). Eén keer instellen, klaar.

**Aanpasbaar:** via **CSS-variabelen** in de browser-source (kleuren, fonts, welke
data zichtbaar is). Let op: de pagina kan bij Cuescore-updates terugvallen op
standaard → CSS kan dan bijwerking vergen.

**Talen:** `lang=`-parameter, 25+ talen (o.a. `en`, `nl`, `nb`, `fr`, `es`).

> **Kans:** de tableId's die we al kennen (61403749 etc.) zijn Cuescore-tafel-id's.
> Waarschijnlijk werkt de officiële overlay direct met
> `https://cuescore.com/scoreboard/overlay/?tableId=61403749&lang=nl`. **Testen op
> één tafel** (Tafel 15) en vergelijken met het huidige pixelgrid-beeld —
> spelersfoto's + huisstijlkleur zijn een duidelijke plus.

## 2) "Scoreboard & Streaming"-dashboard binnen Cuescore
Beheertool in Cuescore die **alle benodigde URL's** voor scoreboards én
stream-overlays op één plek geeft, met twee tabs:
- **Scoreboard-tab:** URL's voor fysieke/venue-scoreborden.
- **Streaming-tab:** codes/links voor overlays in OBS + link naar de uitlegpost.

Ook bereikbaar **vanuit het match-menu** tijdens toernooibeheer. → Hier vinden Nick/wij
de exacte, correcte overlay-URL's per tafel (i.p.v. handmatig id's opzoeken).

## 3) Cuescore JSON-API (beta)
- Documentatieportaal: **`https://api.cuescore.com/`**
- Levert JSON over: **toernooien, wedstrijden (met tafeltoewijzing + live stand),
  deelnemers, ranglijsten, puntensystemen, venues, handicaps**.
- **Beta:** dataset kan wijzigen, weinig officiële spec, "use at your own risk".
  Voor details/afspraken: support@cuescore.com.
- **JavaScript-API** (voor het insluiten van Cuescore-toernooien op andere sites) vereist
  een **Network-account of hoger**.

**Waarom dit voor ons belangrijk is:**
- **"Scores andere tafels"** kunnen we uit de tournament-JSON zelf samenstellen
  (alle tafels + huidige wedstrijd/stand) i.p.v. afhankelijk zijn van het pixelgrid-tool.
- **Website-integratie (fase 4):** de JS-API/JSON is dé bron om de live standen +
  aankomende wedstrijden op de Mokum-site (via Boei17) te tonen — sluit aan op ons
  besluit "video-id's uit eigen backend, standen uit Cuescore".
- Onze backend kan de tournament-JSON pollen en via `/api/live`/`/api/schedule`
  verrijken (spelers, standen per tafel) voor dashboard én widget.

## 4) Méér overlays & extra functies (onderzoek 2026-07-11)
**Binnen Cuescore zelf (gratis, automatisch — past bij onbemande opzet):**
- **Andere tafels tussen wedstrijden:** de officiële scoreboard-overlay toont in de
  idle-stand automatisch **resultaten van andere wedstrijden + de volgende wedstrijd**.
  Dekt deels de oude "Scores other tables"-functie, zelfregelend.
- **Jumbotron** ⭐ — aparte overlay/URL die **alle geplande + lopende wedstrijden**
  real-time in een **raster** toont (±24u venster, team + enkelspel). Kies **welke
  tafels + volgorde** (tafelnummers, komma-gescheiden). Dit is het "scores van andere
  tafels voorbij"-effect dat o.a. KNBB gebruikt.
  - **Vinden:** Dashboard → **Venues → [Mokum-locatie] → tab "Billiard tables"** →
    link **"Live score per table in detailed view"**. Vereist toernooi met status
    Live/Started.
  - **Streamgebruik:** als browser-source in OBS, als aparte scène of hoek-overlay die
    je periodiek toont.
  - **Automatiseringskans:** onze **agent** kan deze overlay periodiek aan/uit zetten
    (bijv. 15s elke paar min) → KNBB-effect zonder operator. Idee voor latere fase.
- **Bracket-overlay** — het toernooischema wordt real-time bijgewerkt en kan als
  stream-overlay/tussenbeeld.

**Losse tools met extra profi-functies (vergen een operator per tafel):**
- **g4ScoreBoard** (OBS-dock) — **shotclock** in Matchroom/Mosconi-stijl (verschijnt bij
  10s, geluid vanaf 5s, 1× 30s-verlenging per rack).
- **CueSport Scoreboard** (iainsmacleod) — **instant replay / replay-buffer**.
- **OBS zelf** heeft een ingebouwde **Replay Buffer** (geen extra tool nodig).
- Afweging: geweldig voor een **bemande finaletafel**, minder voor 4 automatische tafels
  tegelijk (klok/replay moeten bediend worden).

## Aanbevolen vervolgstappen
1. **Testen:** zet op Tafel 15 tijdelijk de officiële overlay-URL
   (`cuescore.com/scoreboard/overlay/?tableId=61403800&lang=nl`) in een tweede
   browser-source en vergelijk met het huidige beeld (foto's, huisstijl, innings).
2. **Scoreboard & Streaming-dashboard** in Cuescore openen (Mokum-organisatie) →
   de officiële per-tafel-URL's + eventuele extra overlay-varianten noteren.
3. **Huisstijlkleur** van de Mokum-organisatie in Cuescore zetten → overlay krijgt
   automatisch de juiste kleur.
4. **API verkennen** (`api.cuescore.com`) met een echt Mokum-toernooi-id: welke
   velden komen terug per tafel/wedstrijd? → basis voor eigen "scores andere tafels"
   + website-widget (fase 4). Bij onduidelijkheid: support@cuescore.com mailen.

## Bronnen
- Nieuwe scoreboard-overlay: https://cuescore.com/cuescore/posts/The+new+scoreboard+overlay+for+streaming/3167627
- Scoreboard & Streaming-dashboard: https://cuescore.com/cuescore/posts/Dashboard+-+Scoreboard+&+Streaming/56990953
- (Verouderde) implementatie-uitleg: https://cuescore.com/cuescore/posts/Implementing+the+scoreboard+overlay+feature/1595544
- API-portaal: https://api.cuescore.com/
- API-dashboard/CSS-vars: https://cuescore.com/cuescore/posts/Dashboard+-+API/57843406
