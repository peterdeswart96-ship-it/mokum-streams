# Overdracht 07/08-10 — Jumbotron bleef aan (verloren commando's, #182), thumbnail MEGA T1, wizard- en competitiekleuren

## Context
Op 07-10 (MEGA Winter Ranking #7) bleef het pauzescherm (jumbotron) op T1 en T3 ruim een half uur in beeld terwijl er al gespeeld werd.
Peter zette de jumbotrons met de dashboardknop uit en vroeg om uitzoeken. De volgende ochtend (08-10) is de fix uitgerold, is de
T1-video van de MEGA alsnog van een thumbnail voorzien en zijn nog twee dashboardwensen gebouwd. Het dashboard-werk van 07-10 staat in
[2026-10-07-dashboard-opmaak-competitiebalk-handover.md](2026-10-07-dashboard-opmaak-competitiebalk-handover.md) (#181).

## Rode draad
Eerst de data, dan de verklaring ([[feedback_eerst_data_dan_verklaring]] in het geheugen): backend-logs, `pauze-state`, `status.json` en uiteindelijk
`agent.log` op de OBS-pc lieten zien dat de uit-commando's van de timer de agent nooit bereikten. Daarna een fix die zowel de oorzaak
(overschreven wachtrij) als het gevolg (geen tweede poging) aanpakt.

## Het incident (#182)
- **Tijdlijn (UTC):** 17:05 streams T1/T3 starten (jumbotron aan, 4× `setOverlay` per tafel in agent.log) · 17:27:42 pauzeScherm logt
  "spelen (pauzescherm uit)" voor T1 en T3 · géén `setOverlay`/`refreshSource` van die batch in agent.log (de `scorebordWacht`-refreshes van
  17:26/17:36/17:38 staan er wél) · 17:55 `status.json`: `jumbotron: true` · 17:59:16 Peters klik (staat wél in agent.log).
- **Waarom het bleef staan:** `volgendeToestand` stuurt alleen bij een *omslag*; de toestand stond al op `spelen`, dus geen tweede poging.
- **Oorzaak (sterke aanwijzing, niet bewezen):** `commands.json` werd op acht plekken met lezen-aanpassen-terugschrijven bijgewerkt zonder ETag-controle,
  en `POST /agent/status` herschreef de wachtrij na élke statusmelding. Een gelijktijdige schrijver overschrijft dan net klaargezette commando's.
  Geen log van de overschrijving zelf; wel: geen foutmeldingen, queue leeg, agent kent de commando's niet.
- **Fix (commit `43fc843`, main, deploy groen, `/api/health` = `43fc843`):**
  - `backend/src/agent/commandStore.js`: `voegCommandosToe` / `verwijderVerwerkt` via `updateJson` (ETag + retry). Gebruikt door `pauzeScherm`,
    `checkStops`, `createBroadcasts`, `nachtStop`, `scorebordWacht`, `streams` (4 plekken) en `agentApi`.
  - `agentApi.js` schrijft de wachtrij alleen nog als de agent iets bevestigt.
  - `planning/pauze.js` (`afwijkendeOverlays`, `magHerstellen`, `HERSTEL`) + `functions/pauzeScherm.js`: **herstelcontrole** — wijkt de door de agent gemelde
    overlaystand 45 s–5 min na een omslag af van de bedoelde, dan alleen die overlays opnieuw sturen (max 3×, ≥ 60 s tussen pogingen;
    logregel `[pauzeScherm] HERSTEL …`).
  - Tests: 584 groen (`commandStore.test.js`, herstelregels in `pauze.test.js`).
- **Nog te bevestigen:** op een echte uitzendavond. Een `HERSTEL`-regel met geslaagd resultaat bewijst dat de herstelcontrole werkt; geen regel en een
  correct pauzescherm is ook goed. **#182 blijft open tot dan**; daarna een punt in `docs/faq-storingen.md` (zie [[feedback_faq_storingen_bijhouden]]).
- **Let op:** een handmatige wijziging van de jumbotron binnen 5 min na een omslag kan door de herstelcontrole max. 3× worden teruggedraaid.

## Thumbnail MEGA T1 (video `tnjGS2BPpmE`)
De uitzending "Tafel 1 Mokum MEGA Winter Ranking #7" had geen thumbnail: `broadcasts/<dag>.json` heeft één entry per tafel per dag, en de later gestarte
challenge-match op T1 verving die entry, dus de finalize-keten liep er nooit voor. Handmatig gedaan met `finaliseerToernooi({ videoId, tournamentId: 88435594, tableNumber: 1 })`
(8 hoofdstukken, 8 archief-regels, thumbnail "MEGA WINTER RANKING / WO 7 OKTOBER / JACKPOT"). Back-up bestaat (`finalize-backup/tnjGS2BPpmE.json`), dus
`/api/manage/finalize/undo` werkt. **Zwakke plek:** twee uitzendingen op dezelfde tafel op één dag → de eerste wordt niet automatisch gefinaliseerd.

## Dashboard (zie ook #181)
- **Wizard stap 1:** elke soort stream een eigen pastelkleur (`STREAM_TYPES[...].kleur`): toernooi blauw, league groen, challenge zand, competitie lila, custom roze.
- **Competitiebalk:** teamnamen thuis rood / uit blauw (eerste naam = thuis), legenda, niveau-pil in de thumbnailkleur (`KLEUR_PER_NIVEAU` is een kopie van
  `backend/src/mokumCompetitie/niveauKleuren.js`; staat nu op drie plekken, genoteerd in `docs/ontwerp/competitie/thumbnail-ontwerp.md`). "(aanvoerder)" is nu
  grijs/cursief omdat rood "thuis" betekent.

## Besluiten / werkwijze
- Backend uitrollen pas als alle streams gestopt én gefinaliseerd zijn (Peter geeft een seintje); herstart tijdens een uitzending is het risico.
- Alleen-lezen diagnose tijdens een live stream; Peter zet zelf de overlays om via het dashboard.
- Eerst een voorbeeld laten zien, dan pushen (ook niet naar `develop` vooraf).

## Valkuilen
- Een thumbnail lokaal zetten via `finaliseerToernooi` heeft `STORAGE_CONNECTION` nodig (`az storage account show-connection-string -n mokumstreams2945`, niet printen) en de
  Chrome-start (puppeteer) werkt alleen via **PowerShell**; via Bash hing het proces zonder uitvoer.
- Log Analytics: filter altijd op `AppRoleName has 'mokum-streams'` (gedeelde werkruimte).

## Wat er nog open staat
- **#182** (verloren commando's) — bevestigen op een echte avond.
- **#181** (dashboard) — Peter moet de tooltip met het dagoverzicht en de uitleg-popup van "Overlays verversen" nog op productie zien.
- #145 (competitiewedstrijden automatisch inplannen); daarna kan de waarschuwing "Streams handmatig starten!" weg.
- Eén uitzending per tafel per dag in de broadcast-store (zie hierboven) — nog geen issue; als het weer gebeurt, een issue aanmaken.
- Niet getest: meerdere competitiewedstrijden met lange teamnamen, en de nieuwe balken op een telefoon.
