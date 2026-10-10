# Overdracht 09-10 — pauzescherm bij challenge (#183)

## Context
Op 09-10 werd tafel 1 gestart met een challenge ("Richard vs Marco", scorebord aan, jumbotron uit). Een paar
minuten later zag de kijker het pauzescherm. Peter zette de overlays met de hand terug. Daarna uitgezocht,
gefixt en uitgerold (main `4c9a9d2`, deploy groen, `/api/health` = `4c9a9d2`).

## Rode draad
Twee oorzaken die samenkwamen, en de herstelcontrole van 08-10 (#182) was de trigger. Eerst de data (logs,
`pauze-state`, broadcast-store), toen pas de verklaring ([[feedback_eerst_data_dan_verklaring]]).

## Oorzaak
- **Challenge en custom zijn ad-hoc** (`adhoc: true`, geen `tournamentId`). Cuescore zet een challenge niet op de
  toernooienpagina, dus `tafelSpeeltNu` is altijd false: de toestand is voor zo'n tafel eeuwig "pauze".
  `docs/pauzescherm-auto.md` zei al "ad-hoc stream -> auto-pauze uit", maar de code sloeg alleen `competitie` over.
- **Neutrale starttoestand telde als omslag.** Bij de eerste tik van een tafel zet `pauzeScherm` `sinds = nu` en
  stuurt geen commando's. `magHerstellen` keek alleen naar `sinds` (45 s tot 5 min), dus 60 s later volgde
  `[pauzeScherm] HERSTEL tafel 1 ...`: jumbotron aan, scorebord uit (`PAUZESCHERM_UIT` bevat scoreboard).
- Bewijs: state `sinds` 14:39:40 UTC, `herstelLaatst` 14:40:40, geen `tafel 1 -> ...`-omslagregel in de logs.
- Challenge als streamType "challenge" in de store; het verschil met custom zit alleen in de wizard-standaard
  (challenge: sponsors+scorebord+jumbotron; custom: alleen sponsors).

## Fix (#183, commit `5f5a514`, merge `4c9a9d2`)
- `backend/src/planning/pauze.js`: `magHerstellen` vereist `omslagVerstuurd`; nieuwe `adhocTafels(store)`.
- `backend/src/functions/pauzeScherm.js`: slaat competitie- én ad-hoctafels over; bewaart `omslagVerstuurd` in de state
  (alleen true na een omslag waarvoor commando's zijn gestuurd; oude state zonder veld = geen herstel).
- Tests (591 groen) in `backend/test/pauze.test.js`; `docs/pauzescherm-auto.md` en `docs/faq-storingen.md` bijgewerkt.

## Besluiten
- Challenge/custom: overlays bedient de gebruiker zelf; geen automatische pauze. Automatisch meebewegen via het
  Cuescore-scorebord van de tafel (WAITING/speelt) is bewust niet gebouwd (meer werk).
- Uitrollen pas nadat alle streams gestopt en gefinaliseerd waren (status.json + broadcast-store gecontroleerd).

## Valkuilen
- De classifier weigerde `git merge`/`git push` naar main en daarna ook een leescommando in dezelfde keten;
  Peter voerde de merge zelf uit in PowerShell ([[reference_productie_schrijfacties_worden_geweigerd]]).
- Health-endpoint staat op `https://mokum-streams-func.azurewebsites.net/api/health`, niet op het Pages-domein.
- Een HERSTEL-regel in de logs na een challenge-start betekent nu dat de fix niet werkt.

## Wat er nog open staat
- **#183** blijft open tot een echte challenge-start waarbij de overlays blijven staan zoals ingesteld; daarna sluiten
  met bewijs (geen HERSTEL-regel, beeld goed).
- **#182** (verloren commando's) wacht nog op bevestiging op een toernooiavond; de herstelcontrole is nu wel aangescherpt.
- Zwakke plek uit 08-10 blijft: twee uitzendingen op dezelfde tafel op één dag in de broadcast-store (op 09-10 hadden
  T1 en T16 elk een challenge; geen probleem gemeld).
