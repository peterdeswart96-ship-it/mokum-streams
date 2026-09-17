# Handover — sessie 17 september 2026 (browsertest competitie-wizard + waarschuwing tafel vrijmaken)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Vierde sessie van 17-09. De vorige is `2026-09-17-competitie-wizard-handover.md`.

## De rode draad

Peter heeft de competitie-wizard (#120) in de browser getest met verborgen streams: dat werkt.
Daarna de vraag wat er gebeurt als iemand een stream start op een tafel waar later een toernooi
gepland staat (meestal tafel 1 en 3). Antwoord: vóór het vrijmaakvenster kan dat zonder
waarschuwing, en dan wordt de stream afgekapt. Daarvoor is een waarschuwing gebouwd (#146),
die op develop staat maar **nog niet live** is.

## Browsertest competitie-wizard (#120) — geslaagd

- Getest op **tafel 15 en 16 tegelijk**, zichtbaarheid **Verborgen**, echte wedstrijd
  (Eerste Klasse, Mokum Mayhem vs. Restless).
- Titels correct (`Tafel 15 Eerste Klasse Mokum Mayhem vs. Restless`), 1080p30 · ±16 Mbps,
  scorebord aan en zichtbaar in de preview (leeg, want de wedstrijd was nog niet bezig).
- Uitkomst staat als comment in #120. **Issue blijft open** tot het scorebord bij een lopende
  teamwedstrijd is gezien: **21-09**.
- Let op: de wizard staat standaard op **Openbaar**; voor een test bewust Verborgen kiezen.
- Of Peter de twee teststreams heeft gestopt en de video's verwijderd, is niet bevestigd.

## Wat er gebeurt bij een stream op een toernooitafel (uitgezocht)

`TAFEL_VRIJMAKEN=true` staat aan in `mokum-streams-func` (gecontroleerd). Voorbeeld toernooi 19:30:

| Moment | Gedrag |
|---|---|
| vóór 19:00 | starten mag; om 19:00 stopt `checkStops` → `planning/vrijmaken.js` de stream, ook midden in een partij |
| 19:00–19:30 | dashboard blokkeert de tafel ("gereserveerd"), beide wizards |
| tijdens toernooi | backend weigert: tafel bezet (`functions/streams.js`, `isTableBusy`) |
| na de finale | tafel weer vrij |

Zwakke plekken: (1) geen waarschuwing vóór 19:00 — **opgelost door #146**; (2) de tijdsblokkade
zit alleen in de frontend (backend kent alleen "bezet") — wie om 18:59 de wizard opent en om
19:01 start, komt erdoor en wordt binnen een minuut gestopt. Niet opgepakt; bewust klein risico.

## Waarschuwing vooraf (#146) — op develop, commit `1b0e72f`, NIET op main

- Nieuwe pure functie `tafelClaims(items, nu)` in `frontend/src/App.jsx`: geeft per tafel
  `nu` (venster open → blokkeren) en `straks` (venster opent vóór de eerstvolgende nachtstop
  02:00 → waarschuwen). Bij meerdere toernooien op één tafel telt het eerste.
- Reservering en waarschuwing komen uit dezelfde functie. Bijvangst: uitgezette
  (`enabled: false`) en geannuleerde toernooien blokkeren niet meer — dat deed de backend al.
- Gewone wizard: oranje melding onder de tafelkeuze, niet blokkerend; geen melding als je juist
  dát toernooi voorstart. Competitie-wizard: "stopt om HH:MM voor …" achter de tafel, plus een
  melding als je zo'n tafel aanvinkt.
- Geen wijziging aan API-contract of backend.
- **Geverifieerd:** `vite build` slaagt; `tafelClaims` met vijf tijden (12:00, 18:45, 19:10,
  19:45, 23:00) nagelopen, inclusief uitgezet toernooi en competitie-record. Frontend heeft geen
  lint-configuratie (alleen `backend/` heeft `npm run lint`).
- **Niet geverifieerd:** in de browser.

## Nog open

- **#146** — mergen naar main (wacht op Peters akkoord), dan browsertest: "Nieuwe stream"
  openen en tafel 1/3 kiezen terwijl er later die dag een toernooi gepland staat. Pas daarna sluiten.
- **#120** — scorebord bij een echte teamwedstrijd op **21-09**.
- Uit eerdere overdrachten ongewijzigd: #133 (BIOS-checklist 18-09), #145, #82, #131, #132, #140.

## Waar de kennis staat
- #120 (testcomment 17-09), #146 (probleem + voorstel), #93 (het vrijmaken zelf)
- `backend/src/planning/vrijmaken.js` — de regels waar `tafelClaims` op aansluit
