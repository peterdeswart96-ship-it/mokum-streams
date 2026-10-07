# Overdracht 07-10 — Dashboard: nieuwe opmaak, competitiebalk en Overlays verversen (#181)

## Context
Peter wilde het beheerdashboard (`frontend/src/App.jsx`) overzichtelijker en consistenter hebben: livestream-tegel
inklapbaar met mooiere tafelknoppen, kleuren, een duidelijke "Overlays verversen"-knop en een nieuwe balk met de
competitie thuiswedstrijden van vandaag. Alles in kleine rondes: eerst een voorbeeld (screenshot), dan pas bouwen en
pushen. Het begin van de sessie ging over Mokum Live (zie
[2026-10-04-mokumlive-toernooifilter-opmaak-handover.md](2026-10-04-mokumlive-toernooifilter-opmaak-handover.md), #180, nu gesloten).

## Rode draad
Alle balken onder de tafelkaarten hebben nu dezelfde antraciet kleur (`#3b3f45`, rand `#5c626a`) en hetzelfde patroon:
titel links, in het midden "Vandaag" + een cirkel met het aantal (groen ≥ 1, rood 0) of de tafelknoppen, pijltje uiterst
rechts. De tafelkaarten en de overzichtsbalk (live/klaargezet/offline) hebben dezelfde kleur.

## Wat er is gebouwd (alles op main)
- **"Nu live op YouTube"** (`StreamPaneel`, `TafelKnop`): inklapbaar (onthouden in `localStorage` `dashboard_stream_open`),
  tafelknoppen gecentreerd; offline grijs, live rood gloeiend cijfer + YouTube-icoon (`.nr-live`/`.yt-live` in `index.css`).
- **Toernooi planner**: kalender-icoon, "Vandaag" + teller van toernooien met `planned && date === zaalVandaag`;
  de rij van vandaag is gedempt groen met donkergroen randje (variant A; variant B "echt lichtgroen" is afgewezen).
- **Nieuwe balk `CompetitieVandaag`**: uitgeklapt dezelfde gegevens als de detailpagina van de competitie-agenda
  (titel, competitie · ronde, datum, locatie, twee teams met spelers en "(aanvoerder)", link naar de agenda).
  Waarschuwing "Streams handmatig starten!" rechts, **alleen als er vandaag ≥ 1 wedstrijd is** (competitiewedstrijden
  worden nog niet vanzelf gestart, #145).
- **Backend:** `GET /api/manage/competitie/vandaag` (api-contract v0.72) in `functions/competitie.js`;
  `mokumCompetitie/vandaag.js` (pure logica + `maakCache`), `getWedstrijdenVandaag` in `mokumCompetitie/index.js`.
  Bron voor spelers: `https://func-mokum-competitie.azurewebsites.net/api/wedstrijd/{teamSlug}/{matchId}`.
  10 minuten geheugencache per instantie; de balk ververst elke 5 min, alleen als het tabblad zichtbaar is.
- **"Overlays verversen"** rechtsboven (met refresh-icoon en tooltip); de bevestiging (`OVERLAYS_VERVERSEN_UITLEG`) legt uit wat het
  doet. De "↻ Ververs beeldbronnen"-links per tafel zijn weggehaald (Peter gebruikte ze nooit).
- **Knoppen:** Preview lichtgrijs met 👀, Stop stream lichtrood met ❌, "+ Nieuwe stream" in de stijl van Sponsors/Scorebord.
- **Tooltip** bij beide "Vandaag"-getallen: één overzicht met de ingeplande toernooien (tijd, naam, tafels) én de competitie
  thuiswedstrijden (`vandaagOverzicht`; beide balken geven hun lijst door aan `App`).

## Besluiten van Peter
- Eerst een voorbeeld laten zien, daarna pas pushen — ook niet eerst naar `develop` ("niet handig").
- Waarschuwing "Streams handmatig starten!" alleen bij ≥ 1 wedstrijd (Peter kreeg de keuze "altijd of alleen dan" en ging akkoord door te pushen).
- Beide tooltips tonen beide overzichten (mijn uitleg van "bij beiden"; niet tegengesproken).

## Valkuilen
- **GitHub Pages-deploy bleef op "waiting" hangen** (run 37610224429, `deploy-frontend` zonder stappen, geen reviewers).
  `gh run cancel` + `gh run rerun` loste het op. Controleer na elke push de run; niet aannemen dat "pushen = live".
- **Dashboard lokaal testen:** `.env.local` wijst naar de productie-API (CORS-blokkade lokaal). Ik gebruikte een wegwerp-node-server in de
  scratchpad die `frontend/dist` serveert met nepdata op `/api/live`, `/api/manage/planning` en `/api/manage/competitie/vandaag`,
  een token in `localStorage` en het productie-URL uit de bundel gestript. Headless Chrome via PowerShell met
  `Start-Process … -RedirectStandardOutput` voor `--dump-dom`.
- Native `confirm()`/tooltips zijn niet te screenshotten; de tekst zelf is via de DOM-dump gecontroleerd.
- `az appservice plan show --ids /subscriptions/...` faalt in Git Bash (pad wordt vervormd): gebruik `-g` en `-n`.
- CRLF: `App.jsx`, `index.css`, `api-contract.md` zijn CRLF; patchscripts normaliseren en zetten terug.

## Kosten
`mokum-streams-func` draait op Flex Consumption, `func-mokum-competitie` op Y1 (beide betalen-per-gebruik). Eén tabblad 24/7 open
kost ~8k aanroepen/maand op onze backend en ~190k op de competitie-API (zonder cache); met de 10-minutencache en verversen alleen bij
een zichtbaar tabblad is dat veel minder. Ruim binnen het gratis tegoed.

## Wat er nog open staat
- **#181 staat open**: Peter moet nog zien dat de laatste wijzigingen (tooltip-overzicht, uitleg-popup, gecentreerde tafelknoppen) op
  productie goed uitkomen.
- #145 (competitiewedstrijden inplannen met automatische start/stop) — dan kan de waarschuwing weg.
- Niet getest: de balk met meerdere wedstrijden op één dag, en de smalle (telefoon)weergave van de nieuwe balken.
- Mogelijke vervolgwens van Peter: "Kopieer voor WhatsApp"/"deelbare link" uit de competitie-agenda, en een mooiere popup voor Overlays verversen.
