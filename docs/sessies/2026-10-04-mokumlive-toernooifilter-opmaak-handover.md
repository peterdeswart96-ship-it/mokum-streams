# Overdracht 04-10 (avond) — Mokum Live: toernooifilter, kleuren en nieuwe opmaak (#180)

## Context
Peter zag op de publieke pagina Mokum Live (`/mokumlive/`) in het toernooifilter nog oude toernooien en
competities staan, terwijl het lopende toernooi (Mokum Multiball 2) ontbrak. Hij vroeg ook om een eigen
kleur per toernooi en om een overzichtelijker uiterlijk, vooral in de XL-weergave.

## Rode draad
Het ontbrekende toernooi was een bronprobleem, geen filterprobleem. Daarna is de pagina opnieuw
opgemaakt volgens de werkwijze "eerst varianten laten zien, dan bouwen" (Peter koos variant A met de
groepering van B), en in drie rondes op zijn aanwijzingen verfijnd.

## Oorzaak (uit de data)
- De pagina haalde de toernooien van vandaag uit `api.cuescore.com/venue/events/?venueId=60451687&date=…`.
  Op 04-10 gaf die lijst: OnePocket (afgerond), "TV table test", 14.1 Summer league en Pool Eredivisie
  2026/2027. **Mokum Multiball 2 (id 90541678) stond er niet in**, op geen enkele dag.
- Onze backend vindt het toernooi wel: `getTodaysTournamentIds` leest de organisatiepagina van Cuescore
  (`cuescore.com/mokumpooldarts`) en is daarmee de betrouwbaardere bron.
- De oude auto-keuze ("het gestreamde toernooi") én een in `localStorage` bewaarde keuze voor de 14.1-league
  zorgden ervoor dat Peter een lege lijst zag ("Geen wedstrijden die aan je zoekopdracht voldoen").

## Wat er is gebouwd (alles op main, deploys groen)
**Data (commit `e34cd0a`)**
- `GET /api/live` krijgt `toernooien: [{id, name, status}]` (`backend/src/functions/liveMatches.js` schrijft het
  in `live-matches.json`, `publicApi.js` geeft het door). API-contract v0.71 staat onderaan `docs/api-contract.md`.
- De pagina voegt die id's samen met `venue/events` (de ene bron vangt wat de andere mist) en filtert:
  `toernooiTelt` = niet afgerond (`Afgerond`/`Finished`) én lopend of iets vandaag; `wedstrijdTelt` = lopend,
  of wachtend zonder starttijd/van vandaag, of afgerond van vandaag. "Vandaag" = zaaldag (grens 06:00).
- Dit laat de 14.1-league (geen partij vandaag), de Eredivisie (novemberdatums) en afgeronde toernooien weg.
- Gevolg: zodra Cuescore een toernooi op `Finished` zet, verdwijnt het van de pagina, ook als de finale net is gespeeld.

**Opmaak (commit `e34cd0a`, `ebed8f1`, `60635cc`)**
- Dropdown + filterpaneel vervangen door toernooi-chips (verborgen bij één toernooi) en drie aan/uit-knoppen
  (Op YouTube, Gepind, Verberg afgelopen). De scrollende ticker is weg.
- Wedstrijden per toernooi in een kaart met gekleurde kop en tellers; toernooien met lopende partijen bovenaan.
- Kleur per toernooi: op naam gehasht naar een palet van 9 niet-rode kleuren, met botsingsafhandeling
  (`bouwKleuren`). Rood is gereserveerd voor "live op onze YouTube".
- Rijen met 📺: rode omlijning met pulserende gloed (`gloedIn`, inset omdat de kaart `overflow: hidden` heeft).
- XL: strook 520-620 px, namen 20 px, score 26 px, grotere knoppen; tafel-tabs 2x groot in pastel
  (1 blauw, 3 groen, 15 geel, 16 lila), gekozen = witte ring, niet-live gedimd, pulserend rood bolletje bij live;
  bovenbalk 2x (logo, titel, hamburger uit `/site-nav.js` via `body.xl #mokumnav-knop`).

## Valkuilen die tijd kostten
- **CORS:** de backend staat alleen `mokum-streams.pdscloud.nl` toe. Een lokale test (`file://` of
  `localhost`) krijgt de `/api/live`-aanroep geblokkeerd. In de testkopie in de scratchpad is `fetch` daarom
  vervangen door een namaakantwoord met `localStorage standen_weergave=xl`.
- Headless Chrome heeft een minimale vensterbreedte van ongeveer 500 px; een mobiele screenshot toont daardoor
  een afgesneden rechterkant. Mobiele weergave is dus niet echt beoordeeld.
- Shell-quoting van backticks en heredocs in Bash brak twee keer een patchscript; scripts met de Write-tool
  schrijven werkt. `api-contract.md` en `index.html` hebben CRLF; na een Node-patch weer terugzetten.
- `develop` loopt achter op `main` (o.a. #173, #175): na deze sessie `main` in `develop` mergen.

## Wat er nog open staat
- **Issue #180 staat open** tot Peter in de browser heeft bevestigd dat alles op productie goed uitkomt
  (werkafspraak 9). Mijn tests zijn headless op een testkopie, niet op de echte pagina.
- Niet getest met twee tegelijk actieve toernooien in productie; de groepering en kleuren zijn alleen met een
  nagebootst tweede toernooi gezien.
- Mobiele (S) weergave is niet aangepast; de grotere XL-stijlen gelden alleen vanaf 1000 px breed.
- Een open tabblad draait de oude pagina: Ctrl+F5.

## Waar de kennis verder staat
- Issue #180, `docs/api-contract.md` (v0.71), `frontend/public/mokumlive/index.html`.
- Context bij de bronnen: [2026-10-04-podium-ander-toernooi-handover.md](2026-10-04-podium-ander-toernooi-handover.md)
  (zelfde dag: Multiball 2 had toen nog geen wedstrijden op cameratafels).
