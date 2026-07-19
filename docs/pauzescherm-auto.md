# Pauzescherm-automatisering (A) — ontwerp

> Doel: **per tafel automatisch** het pauzescherm tonen wanneer er **geen wedstrijd**
> loopt (Jumbotron + Pauzemelding "we wachten op de volgende wedstrijd"), en het weer
> verbergen zodra een wedstrijd begint. Zie ook [[break-productie]] (A/B) en
> [[cuescore-overlays]].

## Toestandsmachine (per tafel)
Twee toestanden:
- **SPELEN** — pauzescherm **uit** (camera + Cuescore-scoreboard normaal).
- **PAUZE** — pauzescherm **aan** (Jumbotron + Pauzemelding).

Transities o.b.v. de Cuescore-status per tafel:
- **SPELEN → PAUZE:** huidige wedstrijd is *finished* én er is (nog) geen nieuwe *playing*
  wedstrijd → na een **debounce** (bijv. 15–20 s) om korte gaten (rackwissels, laden) niet
  als pauze te zien.
- **PAUZE → SPELEN:** er verschijnt een wedstrijd met status *playing* op de tafel → **direct**.
- **Fail-safe:** bij een ophaalfout de toestand **niet** wijzigen (voorkomt flapperen bij een
  hapering van Cuescore).

## ✅ Cuescore live-status per tafel — bron gevonden (11-07)
Achterhaald via F12→Network op de Jumbotron. De **matchdata** komt uit de tournament-API:

- **`https://api.cuescore.com/tournament/?lang=nl&id=<tournamentId>`** → veld **`matches`**
  (array). Per match o.a.:
  - **`matchstatus`** — `"playing"` | `"finished"` | (pending/not started) — **de sleutel**.
    Ook **`matchstatusCode`** (2 = finished).
  - **`table`** — object met **`tableId`** → koppelt de match aan een tafel.
  - `playerA` / `playerB` (naam, land), `scoreA` / `scoreB`, `raceTo`.
- `https://api.cuescore.com/venue/table/?tableId=<id>` → alleen **tafel-config** (geen stand) —
  niet nodig voor A.
- (De Jumbotron gebruikt daarnaast `venue/events/?venueId=&date=` om te weten welke toernooien
  vandaag lopen.)

**Reuse:** onze **backend importeert de toernooien van vandaag al** (planning). Dus A hoeft
alleen per **actief toernooi** de `tournament/?id=`-data te halen en de `matches` te scannen:
zoek per `table.tableId` de match met `matchstatus == "playing"` → SPELEN; anders → PAUZE.
De **volgende** wedstrijd = de eerstvolgende pending match op die tafel (voor de pauzemelding).

**tableId ↔ tafelnummer** (uit `docs/obs-standaard.md` / `config/tables.json`):
1=61403749, 3=61403764, 15=61403800, 16=61403803.

## Architectuurkeuze: waar draait de logica?
| | Optie 1 — Agent-side | Optie 2 — Backend-side ⭐ |
|---|---|---|
| Wie pollt Cuescore | de agent (op de OBS-pc) | een backend-timer |
| Wie beslist + toggelt | agent toggelt OBS direct | backend enqueuet `setOverlay`-commando's; agent voert uit |
| Agent-complexiteit | groter (agent wordt slimmer) | ongewijzigd (blijft "dom") |
| Dashboard-bonus | — | backend kan **match-status + volgende wedstrijd** tonen in `/api/live` |
| Past bij | rotatie B (ook agent-side) | rolverdeling **backend = brein, agent = handen** + bestaand command-model |

**Aanbeveling: Optie 2 (backend-side).** Rationale: sluit aan op de bestaande rolverdeling en
het `setOverlay`-command-model, houdt de agent simpel, en levert **gratis** de dashboard-
weergave (match-status/volgende wedstrijd). Rotatie B mag agent-side blijven: dat is pure
tijd-logica zonder externe data, dus daar hoort 't; A is een **toestand** uit een externe bron
en past beter in het brein.

## Pauzemelding: statisch → dynamisch
- **Nu:** statische tekst per tafel ("We wachten op de volgende wedstrijd op Tafel N").
- **Later:** dynamisch *"Volgende: [spelers] om [tijd]"* uit dezelfde Cuescore-data, via de
  **gehoste overlay** die de backend pollt (zie [[break-productie]] stap 4) — geen `setText`-
  commando nodig, de backend vult de tekst.

## Samenspel met rotatie (B) + handmatige bediening
- In **PAUZE**: de rotatie-ticker (B) **onderdrukken** — de Jumbotron dekt het beeld al.
- **Handmatige override:** de dashboard-toggle blijft werken, maar de auto-logica her-bevestigt
  bij de volgende toestand. Later evt. een **"auto-pauze aan/uit"-vlag** per tafel om auto
  tijdelijk uit te zetten.

## Randgevallen
- **Tafel live zonder enig toernooi** → keuze (config): pauzescherm tonen, of niets.
- **Meerdere toernooien in de zaal** → venue-brede data (Jumbotron dekt dit al).
- **Cuescore traag/down** → fail-safe: huidige toestand behouden, niet flapperen.
- **Ad-hoc stream** (dashboard-start zonder Cuescore-koppeling) → auto-pauze uit; handmatig.

## Gefaseerd bouwen
1. ✅ **Cuescore live-endpoint achterhalen** — gevonden (`tournament/?id=` → `matches` met
   `matchstatus` + `table.tableId`).
2. ✅ **Backend: pollen + toestandsmachine + transitie-commando's** (gebouwd 11-07, v0.12).
   Timer `pauzeScherm` (elke 30s): per streamende tafel via `getTodaysTournaments()` checken
   of er gespeeld wordt (`tafelSpeeltNu`), toestandsmachine met 20s debounce
   (`volgendeToestand`), en bij een omslag `setOverlay`-commando's voor `jumbotron` +
   `pauzemelding`. Toestand in `pauze-state.json`. Gated op `PAUZESCHERM_AUTO` (default uit)
   + alleen op tafels die de agent als `streaming` meldt. Pure logica (`src/planning/pauze.js`)
   unit-getest.
3. ▶ **Dashboard-weergave** van match-status/volgende wedstrijd in `/api/live` (bonus, nog te doen).
4. ▶ **Pauzemelding dynamisch** (gehoste overlay; "Volgende: [spelers] om [tijd]").
5. ▶ **Rotatie-onderdrukking** tijdens pauze (Jumbotron dekt het beeld al → laag-prioriteit).

## Uitrol (avond)
Zet `PAUZESCHERM_AUTO=true` (app-setting) **nadat** de agent draait en de OBS-bronnen
`Jumbotron` + `Pauzemelding` bestaan. Daarvóór doet de timer niets (default uit + geen
streamende tafels).

## Welke overlays het pauzescherm toont (`PAUZESCHERM_KEYS`)
De timer zet standaard **alléén de `pauzemelding`** aan/uit, niet de jumbotron.

**Waarom (besluit 18-07):** de Cuescore-jumbotron (`venue/table/jumbotron/`) dwingt een
instellingenvenster af ("Jumbotron view / Grid size / Table filter") dat middenop het
raster verschijnt en zo mee de uitzending in gaat. Het is een `<cs-jumbotron>`
web-component (Lit) → de dialog zit in **shadow DOM** en is niet weg te krijgen met OBS'
Custom CSS, niet met de oude v1-jumbotron, en niet met wegklikken (komt terug na herladen).
Ook de scorebord-overlays (Modern `/scoreboard/stream/`, Legacy `/scoreboard/overlay/`)
rouleren géén andere tafels in de idle-stand. Er is dus geen schone Cuescore-overlay voor
een zaalbreed overzicht → we bouwen een **eigen tafelraster** (#54) en tonen tot die er is
alleen de tekstmelding.

De app-setting `PAUZESCHERM_KEYS` (komma-gescheiden) overschrijft de standaard zonder
redeploy:
- **niet gezet / leeg** → `pauzemelding` (huidige situatie, schoon, geen venster)
- **`jumbotron`** → de eigen jumbotron-overlay (#54, huidige productie-instelling)

Onbekende sleutels worden stil overgeslagen (`pauzeCommandos` filtert op `OVERLAY_BRON`).

### Inverse: overlays uit tijdens een pauze (`PAUZESCHERM_UIT`)
Sommige overlays moeten juist **aan tijdens spelen** en **uit bij een pauze/idle**. Het
**Cuescore-scoreboard** (`scoreboard`) toont namelijk de laatste wedstrijd op een tafel
en blijft daardoor een **oud/afgelopen toernooi** tonen zolang er geen nieuwe wedstrijd
op die tafel staat (#54). Met de app-setting **`PAUZESCHERM_UIT`** (komma-gescheiden)
worden die overlays bij een pauze uitgezet en bij spelen weer aan:
- **niet gezet / leeg** → geen inverse toggling (standaard)
- **`scoreboard`** → scorebord uit zodra er geen live wedstrijd is → geen oud toernooi in beeld

### Scorebord verversen bij een omslag (`PAUZESCHERM_REFRESH`)
Verbergen lost het beeld op tijdens de pauze, maar bij de **volgende** wedstrijd toont het
Cuescore-scorebord soms nog de laatste (oude) wedstrijd tot het opnieuw geladen wordt.
Met **`PAUZESCHERM_REFRESH`** (komma-gescheiden) stuurt de automatiek bij **elke
play/pauze-omslag** een `refreshSource`-commando voor die bronnen — de agent drukt dan de
"Refresh cache of current page"-knop in, precies wat het handmatig ook oploste. Zet op
`scoreboard`. Vereist een agent die het `refreshSource`-commando kent (anders wordt het
netjes gedropt).

## Beslissingen (vastgelegd 11-07)
- Architectuur: **Optie 2 (backend-side)** — gekozen.
- Debounce SPELEN→PAUZE: **20 s**.
- "Live zonder toernooi": pauzescherm **niet** afdwingen — geen streamende-tafel-match →
  na debounce pauze; ad-hoc/testers kunnen `PAUZESCHERM_AUTO` uit laten. (Fijnafstelling later.)
