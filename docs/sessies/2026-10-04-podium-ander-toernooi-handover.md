# Overdracht 04-10 (avond) — OnePocket-podium op de Multiball 2-streams (#178)

## Context
Zondag 04-10 rond 19:00 was het OnePocket-toernooi afgelopen (finale op T15 om 19:02). Op T1 en T3
zonden toen de streams van "Mokum Multiball 2" en die kregen het medaillescherm van OnePocket.
Peter sloot de streams, verwijderde ze in YouTube Studio en startte ze opnieuw: weer hetzelfde zodra
de jumbotron aan ging (T3 handmatig, T1 vanzelf via het pauzescherm). Zie ook
[2026-10-03-onepocket-thumbnails-ticker-handover.md](2026-10-03-onepocket-thumbnails-ticker-handover.md)
voor het OnePocket-weekend.

## Rode draad
`podiumPerTafel` besliste alleen op basis van wedstrijden in Cuescore. Multiball 2 had op dat moment
nog geen wedstrijd aan een cameratafel gekoppeld (de eerste partij op T1 stond er even, daarna
niet meer). Het deed dus niet mee en kon het podium van een ander toernooi niet tegenhouden. De
oplossing gebruikt wat we al wisten: welk toernooi bij de lopende stream hoort.

## Oorzaak (uit de data, niet gegokt)
- Cuescore-data van 04-10 17:13Z: Multiball 2 had 0 wedstrijden op T1/T3/T15/T16; OnePocket had er 44
  en stond nog op `finished=false`, met de laatste activiteit op T15 om 17:02Z.
- In `backend/src/planning/podium.js` slaat `podiumPerTafel` een toernooi zonder cameratafel-wedstrijden
  over (`if (!eigenTafels.length) continue`). OnePocket claimde daardoor T1, T3, T15 en T16.
- De regels van 05-09 (`heeftNogActiefToernooi`) en 29-09 (`nieuwerElders`) helpen hier niet: de
  eerste hangt aan `finished === true`, de tweede aan jongere wedstrijdtijden op dezelfde tafel.
  Zonder wedstrijden op de tafel is er niets te vergelijken.
- De broadcast-store (`broadcasts/2026-10-04.json`) had wél het goede gegeven: de streams van T1 en T3
  hadden `tournamentId` 90541678 (Multiball 2).

## De fix (issue #178, commit `4ddd418` is de FAQ; de code zit in PR #179, merge `f6ca526`)
- `podiumPerTafel(tournaments, cameraTables, streamToernooi = {})` in `backend/src/planning/podium.js`:
  per tafel het toernooi-id van de lopende stream. Een podium vervalt op die tafel als het id
  verschilt van dat van het claimende toernooi. Geen id bekend (losse streams) = oud gedrag.
- `backend/src/functions/liveMatches.js` leest daarvoor `broadcasts/<zaalDag>.json` (alleen entries
  zonder `stopped` en mét `tournamentId`) in een try/catch; lukt dat niet, dan een warning en de timer
  draait door zonder die controle.
- Test in `backend/test/podium.test.js` bootst het incident na. 571/571 groen, geen lintfouten.
- `podiumVoorZaal` (het zaalbrede veld) is bewust niet aangepast; de jumbotron gebruikt het per-tafel-veld.

## Bewijs
- Deploy 17:17 UTC, `/api/health` meldde `f6ca526` om 17:23.
- `live-matches.json` van 17:23Z: `podiumPerTafel` 1 en 3 = `null` (Multiball 2 streamt daar), T15/T16
  houden het OnePocket-podium (daar zendt niets).
- Peter zette de jumbotron op T1 aan direct na de deploy en zag nog het podium. Een minuut later
  schakelde de stream vanzelf naar het pauzescherm. Verklaring: `liveMatches` draait per minuut, de
  eerste uitkomst was nog van vóór de fix.
- Issue #178 gesloten met bovenstaande data als comment.

## Besluiten die een volgende sessie moet kennen
- Het toernooi-id van de stream is voortaan leidend voor het podium; wedstrijden in Cuescore alleen
  nog als er geen stream-koppeling is.
- Peter merget zelf via `gh pr merge` (methode: merge commit, branch NIET verwijderen: de kopbranch
  is `develop`).

## Wat er nog open staat
- **Niet uitgezocht:** waarom de Multiball 2-partij op T1 (19:07) uit Cuescore verdween: verplaatst of
  indeling aangepast? Het veroorzaakt dit bug niet meer, maar is wel vreemd.
- **Niet getest:** een Multiball-tafel waar OnePocket wél nog zou claimen én waar de stream geen
  `tournamentId` heeft (handmatig gestart). Dat valt terug op het oude gedrag en kan dezelfde fout
  geven; geen incident gezien.
- **#162** (podium bleef weg op 26-09, 14.1 league) staat nog open; de redenering daarvan is niet
  aangeraakt en deze fix verandert niets voor tafels zonder stream-koppeling.
- Het OnePocket-toernooi staat in Cuescore nog niet op `finished` (meerdaags, Nick zet dat zelf).

## Waar de kennis verder staat
- Issue #178, PR #179, `docs/faq-storingen.md` (nieuw punt "Medaillescherm van het vorige toernooi…").
- `backend/src/planning/podium.js` (uitleg bij de regels van 05-09, 29-09 en nu 04-10).
