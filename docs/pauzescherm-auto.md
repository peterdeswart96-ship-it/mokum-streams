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

## 🔑 De kern-onbekende: Cuescore live-status per tafel
We hebben een bron nodig die per **Cuescore-tableId** zegt: *loopt er nu een wedstrijd?*
(+ welke, + de volgende). Die data zit **precies in de Jumbotron** (alle geplande + lopende
wedstrijden per tafel).

**Actie (blokker #1):** het **data-endpoint** achter de Jumbotron achterhalen:
open `cuescore.com/venue/table/jumbotron/?venueId=60451687&branchId=1` → **F12 → Network →
XHR/Fetch** → ververs → zoek de request die de wedstrijd-data teruggeeft → noteer **URL +
JSON-vorm** (welk veld = tafelnummer, welk veld = status/"playing").
- Alternatief: de **Cuescore-API** (`api.cuescore.com`, beta) per toernooi/venue — minder
  gedocumenteerd; endpoint via support@cuescore.com te bevestigen.

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
1. **Cuescore live-endpoint achterhalen** (blokker — zie boven).
2. **Backend:** live-status pollen (timer ~30 s) → per tafel `{ matchActief, currentMatch,
   nextMatch }` afleiden + opslaan + via `/api/live` tonen (dashboard: status + volgende).
3. **Backend:** op **transitie** `setOverlay`-commando's enqueuen (pauzescherm aan/uit),
   met dedup via de opgeslagen toestand (alleen bij wijziging).
4. **Pauzemelding dynamisch** (gehoste overlay die de backend pollt).
5. **Rotatie-onderdrukking** tijdens pauze.

## Openstaande beslissingen
- Architectuur bevestigen: **Optie 2 (backend-side)** — akkoord?
- Debounce-tijd SPELEN→PAUZE (voorstel: 15–20 s).
- Gedrag bij "live zonder toernooi" (pauzescherm of niets).
