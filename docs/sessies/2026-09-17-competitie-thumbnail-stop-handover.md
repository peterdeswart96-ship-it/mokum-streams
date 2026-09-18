# Handover — sessie 17 september 2026 (competitie-thumbnail + automatische stop)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Vijfde sessie van 17-09. De vorige is `2026-09-17-wizardtest-tafelwaarschuwing-handover.md`.

## De rode draad

Deze sessie begon met een vraag over een YouTube-thumbnail voor competitiewedstrijden en
eindigde met twee stukken automatisering live in productie: **#82 (thumbnail, gesloten)** en
**#145 gedeeltelijk (automatische stop, nog open)**. Onderweg bleek dat de status van een
teamwedstrijd in Cuescore veel minder betrouwbaar is dan gedacht, wat de stopregel bepaalde.

Alles staat op main; `/api/health` = `a4ee616` (deploy 17-09 18:32).

## Competitie-thumbnail (#82) — live, issue gesloten

| Onderdeel | Wat | Waar |
|---|---|---|
| Ontwerp | AI-achtergrond (Google AI: 6 poppetjes achter een tafel, beker) + KNBB-logo, niveau in rood, `thuisteam VS uitteam` in wit, rode datumpil | `docs/ontwerp/competitie/` (achtergrond.jpg, knbb-logo.png) |
| Template | `competitie.html`, self-contained (fonts/plaatjes als data-URI) | `backend/assets/thumbnail-templates/` |
| Buildscript | maakt het zwart in het KNBB-logo transparant en bedt alles in | `backend/scripts/bouw-competitie-template.js` |
| Renderer | nieuwe placeholders `{{NIVEAU}}`/`{{THUISTEAM}}`/`{{UITTEAM}}`; teamnamen krimpen samen tot ze passen, niveau blijft op één regel | `backend/src/video/thumbnailHtml.js` |
| Finalize | derde soort naast toernooi/challenge: thumbnail + korte beschrijving, géén hoofdstukken | `backend/src/video/finalize.js` (`finaliseerCompetitie`), `finalizeKeuze.js`, `functions/finalizeVideos.js` |
| Wizard | stuurt `niveau`, `thuisteam`, `uitteam` mee bij het starten | `frontend/src/App.jsx` |

- API-contract **v0.59** (velden + finalize) en **v0.61** (terugval, zie onder).
- Nieuwe achtergrond of logo? Bestand vervangen in `docs/ontwerp/competitie/` en
  `node backend/scripts/bouw-competitie-template.js` draaien.
- **Geverifieerd in productie:** tafel 15 verborgen gestart 18:14, gestopt 18:15, om 18:20 in de
  log `[finalizeVideos] tafel 15 gefinaliseerd (FNk7Z22UmfA) — competitie-thumbnail`, thumbnail
  zichtbaar op YouTube.
- **Bewust niet meegenomen:** de 57 oude, verborgen teamvideo's uit
  `docs/verborgen-video-s-zonder-ontwerp.md`. Hun titels zijn met de hand getypt, dus er zijn
  geen betrouwbare teamnamen. Stond wél in een oude comment van #82 als onderdeel; dat is
  expliciet afgesplitst en staat in de afsluitende comment. Wil Peter dit alsnog, dan een eigen issue.

## Automatische stop van een competitiestream (#145, deel 1) — live, issue open

Besluit Peter (17-09): eerst **alleen de stop**, en die geldt óók voor "nu starten" — niet
alleen voor ingeplande wedstrijden zoals #145 oorspronkelijk zei. Inplannen blijft open in #145.

### Waarom niet alleen op "finished"
Van de 6 teamwedstrijden in onze zaal van 14–16 september sloot de captain er maar **2 dezelfde
avond** af in Cuescore; 3 pas de volgende dag (09:45, 16:48, 09:22) en 1 nooit (Mokumse MikMak,
stond op 17-09 nog op `playing` bij 3-2). Alleen op `finished` stoppen zou dus meestal niets doen.

De stand wordt wél live bijgehouden en telt bij álle afgeronde Klasse-wedstrijden op tot **6**.
De KNBB-wedstrijdformulieren 2026-2027 geven **7 partijen** voor Eredivisie en Divisies
(6 + 10-ball koppel).

### De regels (`backend/src/planning/competitieStop.js`, puur + getest)
- **Klaar** = `matchstatus: finished` **óf** `scoreA + scoreB ≥ aantal partijen`
  (Klasse 6, Divisie/Eredivisie 7).
- De **stand-regel telt pas 90 minuten** na de start van de stream — rem tegen afkappen mocht
  Cuescore in een divisie anders tellen dan in partijen.
- **5 minuten wachttijd** na het eerste signaal (`competitieKlaarSinds` op de entry), instelbaar
  met app-setting `COMPETITIE_STOP_WACHT_MIN`.
- Nooit op tijd of inactiviteit (#134). Vangnet blijft de nachtstop.
- Status komt uit het Cuescore-**competitietoernooi per niveau**; die id's staan vast in
  `backend/src/mokumCompetitie/toernooien.js`. **Elk seizoen bijwerken** — ontbreekt een niveau,
  dan is er geen automatische stop (vangnet = nachtstop).
- Cuescore wordt hooguit eens per 2 minuten bevraagd (`competitieLaatsteCheck`).
- Inbouw in `backend/src/functions/checkStops.js`, in de tak die competitiestreams eerder
  helemaal oversloeg.

## Terugval: teams opzoeken via matchId (v0.61)

De eerste productietest mislukte stil: Peters dashboard was geopend **vóór** de deploy, dus de
oude wizard stuurde `niveau`/`thuisteam`/`uitteam` niet mee. Gevolg: geen thumbnail én geen
stopcheck, zonder enige foutmelding (de beslisregel zei correct "niet genoeg gegevens").

Opgelost in `backend/src/mokumCompetitie/zoekWedstrijd.js`: ontbreken die velden maar is er een
`matchId`, dan zoekt de backend de wedstrijd zelf op in de competitietoernooien (playerA = thuis).
`checkStops` doet dat hooguit eens per 2 minuten, finalize vlak vóór de thumbnail; het resultaat
wordt op de entry bewaard (`teamsOpgezocht: true`). Niet gevonden bij finalize = gewone mislukte
poging met de retry/opgeef-regels van #124.

**Les voor de zaal:** na een deploy het dashboard verversen (Ctrl+F5). De terugval dekt het nu af,
maar de titel en het scorebord komen nog steeds uit de browser die je open hebt.

## Kleine dingen

- Teksten in de competitie-wizard klopten niet meer ("sluit NIET vanzelf", "geen automatische
  thumbnail") — bijgewerkt in `frontend/src/App.jsx`.
- De wizard noemde 02:00 voor de nachtstop; in productie staat `NACHT_STOP_SLUITING_MIN=180`, dus
  **03:00**. Ook in CLAUDE.md rechtgezet (stond op drie plekken).
- Tests: 454 (was 433), lint schoon, `vite build` slaagt.
- Eigen CLI-identiteit kan `broadcasts/<datum>.json` alleen lezen met `--auth-mode key`;
  `--auth-mode login` geeft geen rechten (zie ook het bestaande geheugen over pauze-posters).

## Besluiten van Peter

- Stopsignaal: **"afgerond óf stand compleet"**, met 5 minuten wachttijd.
- De automatische stop geldt ook voor "nu starten" (wijzigt het besluit van eerder op 17-09).
- #82 mag dicht na de geslaagde productietest; de 57 oude video's horen er niet meer bij.
- Terugval via `matchId`: expliciet gevraagd ("JA").
- Merge naar main: expliciet akkoord gegeven voor beide merges van deze sessie.

## Nog open

- **#145** — twee dingen: (1) bevestigen dat de automatische stop werkt. Peter had op de avond van
  **17-09** twee streams lopen op tafel 15 en 16 (`isR6k1HSzxs`, `GpEcyXfY3Xo`, matchId 88251085,
  Eerste Klasse Restless vs. Mokum Remastered, gestart 19:57 lokaal). **Controleer in de logs op
  `[checkStops] … competitiewedstrijd klaar`** en of beide video's een thumbnail hebben.
  (2) het inplannen zelf is nog niet gebouwd.
- **Onzeker:** of Cuescore in de Divisies/Eredivisie de stand in partijen telt. Daar was nog niets
  gespeeld. Bij de eerste divisiewedstrijd de stand nakijken.
- **#120** — scorebord bij een echte teamwedstrijd; de avond van 17-09 is daarvoor de eerste kans.
- Uit eerdere overdrachten ongewijzigd: #133 (BIOS-checklist 18-09), #131, #132, #140.
- Mogelijk verouderd: bij de **challenge**-wizard staat nog "Thumbnail en afronding gebeuren
  voorlopig achteraf", terwijl een challenge met spelersnamen al automatisch wordt afgerond.
  Niet aangeraakt deze sessie.

## Waar de kennis staat

- #82 (afsluitende comment met het bewijs), #145 (comment met de Cuescore-data en de regels)
- `docs/api-contract.md` v0.59 / v0.60 / v0.61
- `backend/src/planning/competitieStop.js` en `backend/src/mokumCompetitie/` (toernooien, zoekWedstrijd)
- Tests: `backend/test/competitieStop.test.js`, `zoekWedstrijd.test.js`, `finalizeKeuze.test.js`
