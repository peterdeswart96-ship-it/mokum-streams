# Overdracht 11-10 — dashboardspeler start op het live-punt (#184)

## Context
Peter zag in het blok "Nu live op YouTube" (Tafel 1) beelden van ongeveer 1u15 eerder. Na wisselen naar Tafel 3 en
terug stond het wel op het huidige beeld. Uitgezocht, gefixt en uitgerold (main `d71fa64`, deploy groen).

## Rode draad
Geen backendprobleem: `/api/live` gaf voor tafel 1 één stabiel `liveVideoId` (= `videoId`). De oude beelden kwamen uit
de YouTube-speler zelf.

## Oorzaak
De embed in `StreamPaneel` was een gewone iframe (`?autoplay=1&mute=1`). Bij een livestream met DVR hervat YouTube
op de plek waar de kijker eerder stopte. Peter had dezelfde stream 1u15 eerder bekeken; dat kwam overeen met de
leeftijd van het beeld. Wisselen van tafel bouwt de speler opnieuw op (`key={vid}`), vandaar dat het toen wel klopte.

## Fix (#184, commit `d0feb3d`, merge `d71fa64`)
- `frontend/src/App.jsx`: nieuw onderdeel `LiveSpeler` (YouTube IFrame API, één keer geladen via `laadYtApi`);
  bij de eerste PLAYING eenmalig `seekTo(getDuration())`. Speler wordt opgeruimd bij wisselen van tafel.
- Geen backend- of API-contractwijziging.

## Besluiten
- Alleen dashboardfrontend aangepast; `develop` was alleen mijn commit voor main, daarom gemerged met `--no-ff`
  (main had eigen merge-commits, fast-forward kon niet).

## Wat er nog open staat
- **Niet bevestigd in de browser** dat de speler nu op het live-punt start (#184 blijft open tot die test).
  Test: dashboard verversen (Ctrl+F5), Tafel 1 openen terwijl je die stream eerder bekeken hebt, kijken of het beeld
  actueel is; wisselen naar T3 en terug. Komt het oude beeld terug, dan doet `seekTo` niet wat verwacht: kijk dan of
  `getDuration()` bij live streams het DVR-einde geeft, of seek vanaf `onReady` in plaats van de eerste PLAYING.
- Mogelijk korte flits van oud beeld vóór de sprong (niet getest).
- `npx eslint` werkt niet in `frontend/` (eslint 10 zonder `eslint.config.*`); alleen `vite build` gedraaid.

## Waar de kennis staat
- Issue #184; `frontend/src/App.jsx` (`LiveSpeler`); patroon van de IFrame API ook in `frontend/public/keuring/index.html`.
