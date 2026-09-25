# Handover — sessie 25 september 2026 (competitie-thumbnail: niveaupil, korte namen, oude video's)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Aanleiding: de streams van 24-09 gingen goed en de stand achteraf was bij alle video's gelukt.
> Peter wilde het uiterlijk van de competitie-thumbnail (#82, gesloten) verbeteren.

## De rode draad

Het niveau ("Tweede Klasse") stond als klein rood tekstje boven de teamnamen. Het is nu een
**gekleurde pil direct rechts van het KNBB-logo**, in dezelfde vorm als de datumpil. Onderweg
zijn ook de tekstindeling en de namen aangepakt, en zijn de 10 bestaande wedstrijdvideo's
opnieuw van een thumbnail voorzien. Alles staat op develop én main (merge `4b5317b`, deploy
"Deploy naar productie" groen). Er is voor deze wijzigingen geen nieuw issue aangemaakt; het
valt onder #82.

## Wat er is gebouwd

| Onderdeel | Wat | Waar |
|---|---|---|
| Niveaupil | pil naast het logo, vaste kleur per niveau, witte tekst; het oude rode niveau-tekstje is weg | `backend/scripts/bouw-competitie-template.js` → `competitie.html` |
| Tekstvak | teamnamen + VS **verticaal gecentreerd** tussen onderkant logo en bovenkant datumpil; overal dezelfde regelafstand (`gap`), geen losse marges meer | idem |
| Verkleinen | lange namen: font, VS en regelafstand krimpen samen; raakt nooit de pillen | `backend/src/video/thumbnailHtml.js` |
| Kleuren | `KLEUR_PER_NIVEAU`, onbekend niveau = grijs `#5b6470` | `backend/src/mokumCompetitie/niveauKleuren.js` |
| Korte namen | `verkortNiveau` ("Derde Divisie Noord-West" → "Derde Divisie") en `verkortTeamnaam` (voorvoegsel als Biljartvereniging/Café/Poolteam en plaats tussen haakjes eraf; cijfers blijven) | idem, test: `backend/test/niveauKleuren.test.js` |
| Documentatie | ontwerpregels + kleurentabel + voorbeelden per niveau | `docs/ontwerp/competitie/thumbnail-ontwerp.md`, `docs/ontwerp/competitie/voorbeelden/`, verwijzing in `CLAUDE.md` |

Kleuren (besluit Peter, "aanhouden voortaan"): Eredivisie goud `#c98a00`, Eerste Divisie blauw
`#1e6fd9`, Derde Divisie paars `#7b3fc4`, Eerste Klasse groen `#1f9d55`, Tweede Klasse oranje
`#e8720c`, Derde Klasse teal `#0e8f9c`. Bewust geen rood (de datumpil is rood).

Alleen de **thumbnail** is verkort; de YouTube-titel en de videobeschrijving zijn ongewijzigd.

## Oude thumbnails vervangen (eenmalig)

De 10 competitievideo's van 17, 21 en 24 september kregen de nieuwe thumbnail:
`isR6k1HSzxs`, `GpEcyXfY3Xo` (17-09), `ckHTgULsPHA`, `HjMurhKHLSM`, `tAiNBpnOpTI`, `I8wHwnrVABo`
(21-09), `2nq9RdE9jvE`, `y_1zS3R9MK0`, `V5FnK8Qj5Wo`, `bNl1ffEauLQ` (24-09).

- Bron voor niveau/teams: de broadcast-store (`broadcasts/<datum>.json`, alleen te lezen met
  `--auth-mode key`), entries met `niveau`/`thuisteam`/`uitteam`. Datum uit de echte starttijd.
- Alleen `thumbnails.set` (`setThumbnail`); beschrijving en backups niet aangeraakt. ~510 quota-eenheden.
- Het script stond bewust alleen in de scratchpad (eenmalig, niet in de repo). Herhalen kan met deze
  lijst en dezelfde aanpak als in het geheugen `project_mokum_kwf_thumbnail_workflow`.
- **Niet meegenomen:** de 57 oude verborgen teamvideo's (handgetypte titels, geen betrouwbare teamnamen).
- Op YouTube zelf is het resultaat door mij niet bekeken; één gerenderde afbeelding wel.

## Besluiten van Peter

- Pil rechts van het KNBB-logo, "erg mooi zo"; elk niveau een eigen kleur, vastgelegd in de docs.
- Tekst altijd gecentreerd tussen logo en datumpil; bij lange namen mag het font kleiner.
- Altijd de korte niveaunaam (geen regio/plaats), teamnamen waar mogelijk inkorten.
- Merge naar main: expliciet akkoord gegeven ("graag naar main committen").
- Oude thumbnails mochten worden aangepast.

## Nog open

- **Inkorten van teamnamen is een voorzichtige eerste versie**: alleen bekende voorvoegsels en plaats
  tussen haakjes. Er is geen echte lijst met Cuescore-teamnamen bekeken. Komt er een te lange naam
  langs, dan regels toevoegen in `niveauKleuren.js` (+ test).
- **Nieuw niveau of seizoen:** kleur toevoegen in `niveauKleuren.js` én in de tabel in
  `thumbnail-ontwerp.md`; niveau ook in `toernooien.js`.
- Eerstvolgende echte competitiewedstrijd: controleren dat de pil en korte namen ook in productie
  goed uit de wizard komen (dashboard eerst verversen met Ctrl+F5).

## Valkuilen deze sessie

- Op deze pc is **geen Python** geïnstalleerd; bewerkingen dus met Node.
- Regexen met backslashes via een shell-heredoc kwamen kapot aan (`\s`, `\b` verdwenen of werden
  een backspace-teken). Schrijf zulke regels met `String.raw` in een los scriptbestand of via Edit,
  en laat de tests draaien.

## Waar de kennis staat

- `docs/ontwerp/competitie/thumbnail-ontwerp.md` (regels, kleuren, voorbeelden)
- #82 (oorspronkelijk ontwerp), `docs/sessies/2026-09-17-competitie-thumbnail-stop-handover.md`
- Tests: 505 groen, lint schoon.
