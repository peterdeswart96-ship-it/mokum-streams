# Overdracht 11-10 — thumbnail-template KNBB Regio Ranking (NH regio 2)

## Context
Op 11-10 (12:00) werd bij Mokum een KNBB-rankingtoernooi gespeeld dat niet onder de gewone Cuescore-toernooien
staat maar op de KNBB-pagina "Pool Regionale Ranking REGIO 2 Noord Holland #1 2026/2027" (tournament 88971886,
9-Ball). Peter wilde er een thumbnail voor, in dezelfde Pixar-stijl als de competitie-thumbnail.

## Rode draad
Peter maakte de achtergrond zelf met Google Gemini (prompt door mij geschreven: jongen en meisje die elkaar de hand
schudden bij een pooltafel met blauw laken, links ruimte voor tekst). Daarna is er een vaste template van gemaakt en
via main uitgerold (merge `80bd847`, workflow "Deploy naar productie" groen, `/api/health` meldt `80bd847`).

## Wat er is gebouwd
- `backend/assets/thumbnail-templates/knbb-regio-ranking.html` — logo linksboven (zelfde plek/grootte als de
  competitie-thumbnail), titel "KNBB REGIO RANKING" (wit) + "NH REGIO 2" (rood), rode datumpil linksonder. Geen
  niveaupil. De titel staat **vast in de template**.
- `backend/scripts/bouw-knbb-ranking-template.js` — bouwt die template uit `competitie.html` + de achtergrond in
  `docs/ontwerp/knbb-ranking/achtergrond.jpg`. Wijzigt de competitie-template? Dan eerst
  `bouw-competitie-template.js`, daarna dit script (het script faalt luid als de opbouw is veranderd).
- `backend/src/video/detectie.js` — `templateVoorToernooi` geeft `knbb-regio-ranking` bij "regionale ranking" óf
  "knbb" + "ranking" in de toernooinaam (vooraan in de functie); `TEMPLATE_TEKST` kreeg een regel. Test in
  `backend/test/detectie.test.js`.

## Besluiten
- Alleen regio 2 NH: andere regio's krijgen een eigen template of aanpassing (niet gebouwd).
- Het ontwerp is rond de achtergrond van Peter gebouwd; het ballenrack daarin is niet perfect (niet een nette ruit),
  Peter vond het "erg mooi zo".

## Wat er nog open staat
- **Niet bevestigd met een echte uitzending.** Controleer na afloop van het toernooi van 11-10 dat de automatisch
  gemaakte thumbnail klopt. Geen issue aangemaakt.
- De datumpil toont bij de automatische render "ZO 11 OKTOBER" (zonder jaar, via `datumThumb`).
- Een eventuele KNBB-ranking op de testomgeving: `develop` deployt nergens, alleen main.

## Valkuilen
- Een in de chat geplakt plaatje is voor mij niet als bestand te vinden; vraag meteen om het pad.
- Regex-escapes (`\s`) gingen verloren in een node-patchscript via heredoc; gecontroleerd met test + `git diff`.

## Waar de kennis staat
`docs/ontwerp/competitie/thumbnail-ontwerp.md` (layout/kleur competitie), `docs/ontwerp/knbb-ranking/achtergrond.jpg`.
