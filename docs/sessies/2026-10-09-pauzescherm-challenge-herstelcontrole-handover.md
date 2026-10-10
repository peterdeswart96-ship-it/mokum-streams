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

## Wat er nog open staat (zie ook het tweede onderwerp hieronder)
- **#183** blijft open tot een echte challenge-start waarbij de overlays blijven staan zoals ingesteld; daarna sluiten
  met bewijs (geen HERSTEL-regel, beeld goed).
- **#182** (verloren commando's) wacht nog op bevestiging op een toernooiavond; de herstelcontrole is nu wel aangescherpt.
- Zwakke plek uit 08-10 blijft: twee uitzendingen op dezelfde tafel op één dag in de broadcast-store (op 09-10 hadden
  T1 en T16 elk een challenge; geen probleem gemeld).

## Tweede onderwerp (10-10): planner-import ziet geen toekomstige toernooien meer
Peter zag in de Toernooi planner bij toekomstige toernooien "niet meer bij Cuescore". Uitgezocht (alleen-lezen):
- Alle 11 gemarkeerde toernooien (MEGA Winter Ranking #8-#12, Fluke 9ball S4 #6-#8, 8ball Ranking S4 #6-#8) bestaan nog:
  `api.cuescore.com/tournament/?id=...` geeft status "Upcoming", en ze staan op `cuescore.com/mokumpooldarts`.
- **Oorzaak:** de import (`backend/src/cuescore/index.js` -> `haalToernooienPaginas`) leest `/tournaments?s=2` en `?s=0`. Die pagina
  bevat nu alleen `<cs-tournaments organization-id="59097676">`, een client-side onderdeel, dus `parseTournamentsByDate` geeft `[]`.
  Alleen toernooien met `class="date live"` op de organisatiepagina (vandaag + de league) komen nog binnen.
- **Gevolg:** `opschonenVerdwenen` (`planning/planning.js`) stempelde ze op 08-10 15:00 UTC met `cuescoreWegSinds` en ontwapende ze
  3 uur later (`cuescoreWeg: true`, `planned: false`): geen automatische broadcast. Het toernooi van vandaag verscheen na een
  refresh weer doordat het live gemarkeerd is.
- Nog niet uitgezocht: sinds wanneer Cuescore dit veranderde.
- **Besluit Peter:** voorlopig starten Mokum-medewerkers de toernooien met de hand. Maandag 12-10 overleg met Nick/Mark over een
  eenvoudigere, minder foutgevoelige opzet; Peter komt daarna terug. **Er is bewust nog geen issue aangemaakt en niets aan de import gewijzigd.**
- Opties voor straks (niet gebouwd): import via de organisatiepagina of de Cuescore-API i.p.v. de lijstpagina. Records herstellen
  vanzelf zodra ze weer gezien worden (`planning.js` wist `cuescoreWeg` dan).
