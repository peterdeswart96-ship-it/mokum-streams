# Handleiding voor teamcaptains — scores in de stream

> **ACHTERHAALD (22-09-2026) — NIET VERSPREIDEN.**
> Dit stuk is geschreven op een diagnose die onjuist bleek. De teams hielden hun partijen wél
> bij: op de juiste tafels, met bijgewerkte stand, netjes afgesloten (bewijs in #153). Het
> probleem lag bij ons: de browserbron in OBS bevroor, waardoor het beeld bleef hangen terwijl
> de gegevens in Cuescore gewoon meeliepen. Dat is opgelost door de bron te verversen.
>
> Dit bestand blijft staan omdat de overdracht ernaar verwijst. Intrekken of herschrijven is
> nog een besluit van Peter.


> Doelgroep: de captains van de teams die bij Mokum spelen. Dit bestand is de bron; de
> deelbare versie staat als pagina online (link hieronder) en is wat de captains krijgen.

**Pagina:** https://claude.ai/artifact/75thrv64s4toTzL3wSgBCc
(privé tot Peter hem deelt via het Share-menu van die pagina)

## Waarom deze handleiding bestaat

Het Cuescore-scorebord in de uitzending toont wat er in Cuescore aan de **tafel** hangt. Bij een
teamwedstrijd koppelt Cuescore zelf niets aan tafels: de teamwedstrijd heeft `table: []` en
`frames: []` (zie #153). Wat er in beeld komt, is dus de partij die spelers zélf aan die tafel
koppelen — en de stand die zij daar bijhouden.

Op 21-09 ging dat mis op alle vier de cameratafels: de partij was wél correct gekoppeld, maar de
stand werd nooit bijgewerkt (0-0, 3,5 uur lang). Op 17-09 ging het goed, bij precies dezelfde
opzet. Het verschil is menselijk, niet technisch.

## De vier handelingen

1. Partij op de juiste tafel zetten (alleen 1, 3, 15 en 16 hebben een camera)
2. Stand bijwerken tijdens het spelen, na elke game
3. Partij afsluiten als hij klaar is
4. De volgende partij aan de tafel koppelen

## Nog te verifiëren vóór verspreiding

De handleiding beschrijft de **handelingen**, niet de exacte schermen van Cuescore: dat klikpad is
niet nagetrokken (daar is een captain-account voor nodig). Loop het één keer na met een captain en
vul de schermstappen aan waar dat helpt.

## Verwante issues

- #153 — de storing van 21-09 + het vangnet dat de stand weghaalt als die stilstaat
- #156 — ochtendrapport meldt een stilstaande stand
