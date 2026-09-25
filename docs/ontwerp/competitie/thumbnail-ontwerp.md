# Competitie-thumbnail — ontwerpregels

Vastgesteld op 25-09-2026 (besluit Peter). Houd deze regels aan bij elke wijziging aan de
competitie-thumbnail (#82).

## Indeling (1280×720)

- **KNBB-logo** linksboven; **niveau-pil direct rechts ervan**, verticaal gecentreerd op het logo.
- **Datumpil** (rood) linksonder.
- **Teamnamen** (`thuisteam` / VS / `uitteam`) staan verticaal **gecentreerd tussen de onderkant
  van het logo en de bovenkant van de datumpil**, met overal dezelfde regelafstand.
- Bij lange namen wordt het font kleiner (samen met VS en de regelafstand), zodat de tekst
  nooit de pillen raakt. Niets loopt buiten het vak.

## Kleur per niveau

De pil heeft witte tekst; elk niveau heeft een vaste kleur. **Geen rood** — dat is de datumpil.

| Niveau | Kleur | Hex |
|---|---|---|
| Eredivisie | goud | `#c98a00` |
| Eerste Divisie | blauw | `#1e6fd9` |
| Derde Divisie Noord-West | paars | `#7b3fc4` |
| Eerste Klasse | groen | `#1f9d55` |
| Tweede Klasse | oranje | `#e8720c` |
| Derde Klasse | teal | `#0e8f9c` |
| (onbekend niveau) | grijs | `#5b6470` |

**Bron in de code:** `backend/src/mokumCompetitie/niveauKleuren.js`. Nieuw niveau (bv. een
Tweede Divisie of nieuw seizoen)? Kleur daar toevoegen, ook in deze tabel, en kies een kleur die
zich duidelijk onderscheidt van de bestaande. Zet het niveau ook in `toernooien.js`.

## Waar het staat

- Template bouwen: `node backend/scripts/bouw-competitie-template.js` (CSS/layout staat in dat script).
- Renderer (kleur invullen, tekst passend maken): `backend/src/video/thumbnailHtml.js`.
- Bestaande thumbnails veranderen niet vanzelf; alleen nieuwe wedstrijden krijgen de pil.

## Korte namen (besluit 25-09-2026)

- **Niveau altijd kort:** "Eerste Klasse", "Eerste Divisie", "Derde Divisie" — nooit met regio of
  plaats erachter ("Derde Divisie Noord-West" wordt dus "Derde Divisie").
- **Teamnamen zo kort mogelijk:** een voorvoegsel als "Biljartvereniging", "Café" of "Poolteam" en
  een plaats tussen haakjes vallen weg. Cijfers ("… 2") blijven staan, anders zijn team 1 en 2
  van één club niet meer te onderscheiden.
- Code: `verkortNiveau` en `verkortTeamnaam` in `backend/src/mokumCompetitie/niveauKleuren.js`
  (getest in `backend/test/niveauKleuren.test.js`). De titel van de YouTube-video zelf blijft
  ongewijzigd; alleen de thumbnail is korter.

## Voorbeelden

Actuele voorbeelden per niveau: `docs/ontwerp/competitie/voorbeelden/`.
