# Handover — sessie 17 september 2026 (competitie-wizard, nu starten + OBS-pc-diagnose)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Derde sessie van 17-09. De vorige is `2026-09-17-storing-16-09-handover.md`.

## De rode draad

De sessie begon met de **competitie-wizard (#120)**. Die is opgeknipt: "nu starten" is gebouwd
en staat live, "inplannen" is een eigen issue geworden (#145). Onderweg bleek de gevreesde
afhankelijkheid van het mokum-competitie-project kleiner dan gedacht.

Daarna kwam de OBS-pc terug online en is de uitval van die nacht onderzocht (#133). Dat leverde
een patroon op van **drie harde uitvallen** en een BIOS-checklist voor Peters bezoek op 18-09.

## Competitie-wizard: nu starten (#120) — live sinds 17-09 ±11:40, commit `00ed2f5`

| Onderdeel | Wat | Waar |
|---|---|---|
| Endpoint | `GET /api/manage/competitie/wedstrijden` (beheer-auth): teamwedstrijden bij Mokum, vanaf vandaag | `functions/competitie.js` |
| Filterlogica (puur, getest) | op `venueName` ("mokum pool"), niet op `isHome`; zaal-dag ≥ vandaag; onderlinge wedstrijd één keer met beide teams; thuisteam uit `isHome` | `mokumCompetitie/bijMokum.js`, `mokumCompetitie/index.js` (`getWedstrijdenBijMokum`) |
| Stream starten | slaat `streamType: 'competitie'` + `matchId` op | `functions/streams.js` |
| Bescherming | competitie nooit aan een toernooi koppelen; nooit inactiviteitsstop (ook niet met `INACTIVITEIT_STOP=true`) | `planning/koppel.js`, `functions/checkStops.js` |
| Frontend | vijfde soort in de wizard; eigen component `CompetitieWizard`: categorie → niveau (overgeslagen bij één) → team → wedstrijd → tafels (meerdere) + overlays + zichtbaarheid → bevestigen | `frontend/src/App.jsx`, `frontend/src/api.js` |

- API-contract **v0.58**. Tests 433 (was 424), lint schoon. Geen bestaande test aangepast; één
  test toegevoegd aan `koppel.test.js`.
- Titel: `Tafel {nr} {niveau} {thuisteam} vs. {uitteam}`.
- Tafel bezet of gereserveerd → er start niets. Mislukt een tafel halverwege, dan meldt de wizard
  welke tafels wél draaien, en een nieuwe poging slaat die over.
- **Geverifieerd:** workflow groen, `/api/health` = `00ed2f5`, endpoint geeft 401 zonder token,
  live bundle bevat de wizard. De functie tegen de echte mokum-competitie-API gaf 186 wedstrijden,
  0 mislukte teams, onderlinge wedstrijden en de Eredivisie correct.
- **Niet geverifieerd:** de wizard in de browser (vraagt het beheertoken) en een echte stream.

### Belangrijke ontdekking over de mokum-competitie-API
De API laat een wedstrijd **niet** vallen zodra die begint: `wedstrijden.js` filtert alleen
`played`/`finished`, en een lopende wedstrijd heeft `playing`. Omgekeerd blijft een wedstrijd die
in Cuescore nooit is afgesloten dagen hangen (Mokumse mikmak van 14-09 stond op 17-09 nog op
`playing`). Daarom filtert mokum-streams zelf op zaal-dag. Issue mokum-competitie#9 is daarmee
niet meer blokkerend (staat als comment in dat issue).

## OBS-pc: drie harde uitvallen (#133)

Uit het eventlog (door Peter op de pc gedraaid):
- Harde uitval op **24-08 12:38**, **15-09 11:21** (overdag, zonder stream; nog niet bekend) en
  **17-09 tussen 01:41 en 02:16**. Op 17-09 pas om 15:10 met de hand weer aangezet.
- `BugcheckCode` 0 en `PowerButtonTimestamp` 0 bij alle drie, geen minidumps, geen WHEA-,
  nvlddmkm- of schijffouten. Dus **geen blauw scherm**: óf de stroom viel weg, óf de pc bevroor
  zonder logregel.
- `MokumWeeklyRestart` draaide om 15:13 met 0x800710E0 ("geweigerd") en herstartte niet.
  `StartWhenAvailable` staat uit, dus hij haalt geen gemiste herstart in. Waarom hij om 15:13 liep,
  is niet verklaard; het is geen risico.
- Na de boot: `MokumOBS-Autostart` 0, 4× obs64, agent online.

De BIOS-checklist voor 18-09 staat in `docs/obs-pc-autostart.md` (sectie "BIOS-checklist voor op
locatie"): After Power Loss = Power On, Wake on LAN aan, ErP uit; XMP, temperatuur en BIOS-versie
alleen fotograferen; stroomsituatie navragen; eindtest met stekker eruit.

## Besluiten van Peter

- **#120 opgeknipt:** eerst alleen "nu starten". Inplannen → #145.
- **Stoppen:** "nu starten" stopt alleen handmatig (of via de nachtstop). Een **ingeplande**
  competitiewedstrijd stopt wél automatisch zodra Cuescore de wedstrijd afgerond meldt (#145).
- **Scorebord standaard aan**; testen op de eerstvolgende competitieavond.
- **Issue in de mokum-competitie-repo:** toestemming gegeven → mokum-competitie#9.
- **Alles naar main:** expliciet gevraagd en uitgevoerd voor de wizard (gold voor déze wijziging).

## Nog open

**Wacht op een test:**
- #120 — browsertest van de wizard (bijv. een "Verborgen" stream op één tafel), en het scorebord bij
  een echte teamwedstrijd. Eerstvolgende avond: **21-09** (drie wedstrijden bij Mokum). Pas daarna sluiten.

**Op locatie (18-09, Peter):**
- #133 / #43 / #60 — BIOS-checklist afwerken, vragen of de pc op 17-09 uit of bevroren was, en
  stekker/stekkerdoos nagaan. Uitkomst in #133 zetten.

**Nog niet aan begonnen:** #145 (inplannen), #82 (thumbnail competitie), #131, #132, #140 (zie vorige overdracht).

## Waar de kennis staat
- #120 (besluiten-comment), #145, mokum-competitie#9 (plus aanvulling)
- #133 — twee comments met de volledige eventlog-analyse
- `docs/api-contract.md` v0.58
- `docs/obs-pc-autostart.md` — BIOS-checklist
