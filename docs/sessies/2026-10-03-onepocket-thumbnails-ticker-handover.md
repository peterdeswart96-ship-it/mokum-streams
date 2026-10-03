# Overdracht 03-10 — OnePocket-weekend: thumbnails, finalisatie, datum-bug en ticker-issue

## Context
Het OnePocket.org-weekend (1–3 okt 2026): hoofdtoernooi "5th Anniversary edition OnePocket.org
Member tournament" (Cuescore-ID 74776897) plus twee side events, One Ball OnePocket (1 okt,
gespeeld) en Bank Pool (3 okt 20:00 op tafel 1 en 3). Peter wilde één herkenbare thumbnail
voor alle drie, met een pil per event. Daarnaast kwam een datum-bug in de wizard boven en een
wens voor een tickerbalk-overlay. Zie ook [2026-10-02-meerdaags-toernooi-sponsors-handover.md](2026-10-02-meerdaags-toernooi-sponsors-handover.md)
(staat op `develop`) voor de achtergrond van het meerdaagse toernooi en de dagelijkse Cuescore-workaround.

## Wat er is gedaan

### 1. Thumbnails ontworpen (buiten de repo)
- Peter leverde een poster (groene Amsterdam-kaart met logo's). Ik schreef eerst een Gemini-prompt,
  daarna zijn de pillen met een PowerShell-script (`System.Drawing`) op de poster getekend: dat is
  betrouwbaarder dan Gemini, dat logo's kan vervormen.
- Gekozen stijl: **gele pil** `#E8DE24` (gemiddelde kleur van de gele vlakken in het 8nOut-logo),
  zwarte tekst, 20% kleiner dan de eerste versie, midden onderaan, **geen datumpil** (die is op
  verzoek geschrapt). Pilteksten: `ONEPOCKET.ORG MAIN EVENT`, `ONE BALL ONE POCKET`, `BANK POOL`.
- Bestanden staan bij Peter in `C:\PDS\06 Fotos en media\Google AI plaatjes\` (`geel - ….png`).
  Peters originele template (`one pocket 2026.jpg`) is bij het opruimen verdwenen; de pilloze
  achtergrond is daarom teruggebouwd uit de Bank Pool-PNG (het gebied onder de pil was al opgevuld
  met gespiegelde achtergrond). Ze staat nu ingebed in `onepocket-event.html`.

### 2. Thumbnails handmatig op YouTube gezet
- Via `setThumbnail` uit `backend/src/youtube/videos.js` in een los script (zoals bij het KWF-toernooi).
- **Main event 2 okt:** T1 `s10_DMOHqaI`, T3 `YusxZKbdqxU`, T15 `TrbqiXVUcLc`, T16 `iFAEZEIW6DU`.
  Tweemaal gezet: eerst tijdens de uitzending, en opnieuw nadat de automatische finalisatie er
  een eigen thumbnail overheen had gezet (T3 was al eerder klaar en is apart teruggezet).
- **One Ball 1 okt:** T1 `oaBFB7JV0c4`, T3 `HErtHiRT4dA`, T15 `iHcf0jl4wqI`, T16 `660apCdhEQw`.
- Geen backup nodig: de finalisatie maakte al een backup van de echte originele YouTube-thumbnail
  (`finalize-backup/<videoId>.json`), `/api/manage/finalize/undo` blijft werken.

### 3. Finalisatie gebruikt dezelfde thumbnail (live sinds 02-10 21:48)
- Nieuwe template `backend/assets/thumbnail-templates/onepocket-event.html` (poster + gele naampil,
  Anton-lettertype ingebed, want Arial Black bestaat niet op de Azure-Linux-server).
- `backend/src/video/detectie.js`: drie nieuwe sleutels `onepocket-main-event`, `onepocket-one-ball`,
  `onepocket-bank-pool`, gekozen op de Cuescore-naam (Member/Anniversary; "One Ball One Pocket";
  Bank Pool alleen mét "side-event" of "onepocket" in de naam, zodat een gewoon Bank Pool-toernooi
  de poster niet krijgt). Titels in `TEMPLATE_TEKST`.
- `backend/src/video/thumbnailHtml.js`: `TEMPLATE_BESTAND` laat de drie sleutels één HTML-bestand
  delen.
- Tests in `backend/test/detectie.test.js`. Gemerged als **PR #168** (commit `2c925bd`, merge
  `a97674e`), gedeployed, `/api/health` meldde `a97674e` om 19:48 UTC.
- **Merge-omvang:** `develop` had nog vier oudere, niet-gemergde commits (podium-fix `1d94804`,
  wizardtekst `903a36f`, twee docs-commits). Peter koos bewust om **alleen mijn commit** over te
  zetten; daarom is `44756e3` op een aparte branch bovenop `main` ge-cherry-picked
  (`feat/onepocket-thumbnail`). Gevolg: dezelfde wijziging staat op `develop` als `44756e3` én op
  `main` als `2c925bd`. Bij de volgende merge van `develop` naar `main` kan dat een (triviaal)
  conflict of dubbele wijziging geven; controleer dat.
- `gh pr merge` werd door de permissiecontrole geweigerd (ook met Peters akkoord); Peter heeft de
  PR zelf op GitHub gemerged.

### 4. Datum-bug in de wizard (issue #170)
- Nick verzette in Cuescore de startdatum naar 3 okt (dag 2). De wizard toonde het toernooi nog als
  "vr 2 okt". Cuescore-API gaf het goede antwoord (start 3-10-2026 09:00, stop 21:59, Active).
- Oorzaak: `mergePlanning` (`backend/src/planning/planning.js`) hield `date: oud.date` vast terwijl
  `plannedStart`/`plannedStop` wel werden bijgewerkt. Streams starten werkte gewoon; het was een
  label (en het filter van de herinnering `herinnering.js` dat op `date` filtert).
- Fix: `date: afgeleideDatum(t.start) || oud.date`, plus test. Commit `fe8f62b` op branch
  `fix/planning-datum-verversen`. **Niet gemerged of gedeployed** (er liepen streams).

### 5. Tickerbalk-overlay (issue #169, alleen vastgelegd, niets gebouwd)
Besluiten van Peter, allemaal in het issue:
- Zwarte balk, rode tekst, zo ver mogelijk onderaan, altijd **bovenop alle andere overlays**.
- Eén tekst of roterende lijst; rotatie-interval en scrollsnelheid instelbaar maar globaal voor alle tafels.
- Inplanbaar met één start- en eindtijd voor de hele balk en per tafel (geen eindtijd per bericht).
- Gaat automatisch uit zodra scorebord of jumbotron iets toont (voorlopig), maar een **handmatig
  aangezette** balk blijft staan tot Peter hem zelf uitzet, mét duidelijke waarschuwing in het dashboard.
- Sjablonen zelf te wijzigen in het dashboard; startset "Start om HH:MM", "Pauze tot HH:MM",
  "Finale begint straks", "Vrije tekst"; `HH:MM` is een plaatshouder.
- **Randvoorwaarde:** het dashboard moet blijven werken. Daarom een aparte blob `config/ticker.json`
  (niet `config/defaults.json`), lezen met try/catch (`readJson` gooit bij een beschadigde blob),
  schrijven met validatie, ticker-paneel dat los mag falen.
- Plaatsing/uiterlijk wordt uitgebreid getest met proefversies in OBS. #65 (pauzescherm-ticker) kan
  deels herbruikbaar zijn. Contract (`docs/api-contract.md`) eerst bijwerken (werkafspraak 3).

## Besluiten die een volgende sessie moet kennen
- Gele pil `#E8DE24`, zwarte tekst, geen datum op de thumbnail.
- Bank Pool op **3 okt 20:00 op T1 en T3**: om 19:30 worden die tafels automatisch vrijgemaakt en
  stopt een lopende main-event-stream daar (ook midden in een partij). Peter stuurt rond 18:00 zelf een
  reminder aan Nick om T1 en T3 vrij te houden. T15 en T16 blijven main event.
- Merge naar `main` blijft Peters expliciete besluit; een deploy pas als er niets meer zendt.

## Valkuilen (tijd gekost)
- **Azure-login:** `az login` zonder scope was niet genoeg. De Node-scripts (`DefaultAzureCredential`)
  faalden tot `az logout` en `az login --tenant eda60494-df1c-4240-b2cf-8f34789b5adf --scope "https://vault.azure.net/.default"`.
  Ook `az storage blob … --auth-mode key` werkt pas na een geldige login.
- `az storage blob download` gaf een verlopen-sessiefout; de oude bestanden in `%TEMP%` bleven
  dan staan en leken "actuele" data (gisteren niet te onderscheiden van vandaag). Altijd de datum
  van het bestand en de exit-status controleren.
- De originele poster-template is weg; nieuwe varianten bouw je vanaf `onepocket-event.html`
  (achtergrond ingebed), niet vanaf een JPG in Peters map.

## Wat er nog open staat
- **#170 (datum-bug):** fix staat klaar, wacht op merge + deploy met Peters akkoord, daarna echte controle
  in de wizard en dan pas sluiten.
- **Controleren:** of de finalisatie van Bank Pool (3 okt) automatisch de gele poster met "BANK POOL"
  kiest (naam `SIDE-EVENT | Bank Pool` zou matchen) en of de finalisatie na de finale van het main event
  de gele thumbnail pakt. Niet gezien op het moment van schrijven.
- **`develop` loopt achter/voor:** podium-fix `1d94804` en wizardtekst `903a36f` staan nog niet op
  `main` (de podium-fix verandert het medaillescherm, daarom bewust uitgesteld vlak voor de finale).
- **#169 (ticker):** uitwerken na proefversie in OBS; open punten: plaatsing onderaan zonder het
  scorebord te hinderen.
- Het meerdaagse toernooi vraagt nog dagelijks dat Nick de Cuescore-tijden verzet (zie overdracht 02-10).

## Waar de kennis verder staat
- Issues: #168 (PR, gemerged), #169 (ticker), #170 (datum-bug), #65 (oude pauzescherm-ticker).
- `docs/sessies/2026-10-02-meerdaags-toernooi-sponsors-handover.md` (op `develop`), `backend/src/video/detectie.js`,
  `backend/src/planning/planning.js`.
