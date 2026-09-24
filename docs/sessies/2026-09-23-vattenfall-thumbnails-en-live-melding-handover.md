# Overdracht 23-09 — Vattenfall-bedrijfsfeest: live-melding uitgezocht + thumbnails gemaakt

Aanleiding: Nick zag op 22-09 tijdens het Vattenfall-bedrijfsfeest een gele waarschuwing
("Zendt uit zonder lopende uitzending in het systeem") op Tafel 1 in het dashboard.
Peter wilde weten wat die melding betekent, of de streams van die avond gelukt zijn, en
liet daarna nieuwe Vattenfall-thumbnails maken en op de video's zetten.

## Rode draad

De melding zelf bleek niet te wijzen op een echte "verweesde" stream (alle vijf
Vattenfall-uitzendingen stonden netjes met de juiste naam in YouTube Studio, gestart via
het dashboard en gekoppeld aan echte Cuescore-toernooien "Vattenfall Beginner"/"Expert").
De werkelijke oorzaak lag in een UX-probleem van de Stop-knop (zie #159 hieronder), niet
in een systeemfout. Verder is een set Pixar-stijl thumbnails gemaakt en op de vier
privévideo's gezet.

## 1. Live-melding uitgezocht

**Wat de melding betekent:** [App.jsx:328-332](../../frontend/src/App.jsx#L328-L332) —
verschijnt als een tafel `status === 'live'` is maar geen `title` heeft, d.w.z. het
systeem kan de lopende uitzending niet koppelen aan een bekende broadcast.

**Onderzoek (broadcast-store `broadcasts/2026-09-22.json`, backend-traces in
Log Analytics, en YouTube Studio):**
- 17:34–18:30 lokale tijd (vóór het Fluke ranking-toernooi van 19:30): vier
  dashboard-gestarte, privé Vattenfall-uitzendingen, elk gekoppeld aan een echt
  Cuescore-toernooi ("Vattenfall Beginner" tournamentId 89854105, "Vattenfall Expert"
  tournamentId 89853706): Tafel 1 Beginner (2x, na elkaar), Tafel 1 Expert, Tafel 3
  Beginner. Elke keer sloot de automatiek de stream netjes af zodra Cuescore het
  toernooi als afgerond meldde.
- 19:20–23:05: de reguliere Fluke ranking-uitzendingen op Tafel 1 en 3, volledig
  automatisch, geen fouten.
- Alle vijf video's staan compleet en correct (juiste titel, privé) in YouTube Studio —
  bevestigd door screenshots tijdens de sessie.

**Conclusie:** de gele melding hoorde bij een kort moment van vertraging tijdens het
stoppen van de eerste "Tafel 1 Vattenfall Beginner"-stream — zie #159.

**Antwoord op "zijn de streams van gisteren gelukt":** ja, alle 7 uitzendingen van
22-09 (5x Vattenfall privé + Tafel 1 & 3 Fluke ranking publiek) zijn compleet en zonder
fouten afgerond.

## 2. Nieuw gevonden: Stop-knop zonder 'bezig'-feedback (#159)

Tijdens het onderzoek bleek dat de Stop-knop op 22-09 binnen 80 seconden 10x is
ingedrukt voor dezelfde stream. Oorzaak: `manage/streams/stop` zet alleen een commando
in de wachtrij en antwoordt meteen (`backend/src/functions/streams.js:174-186`); de
agent haalt die pas elke 5s op (`agent/src/config.js:38`); het dashboard ververst en
ontgrendelt de knop meteen na de (snelle) API-call
(`frontend/src/App.jsx:1684-1690`), dus zonder dat de gebruiker ziet dat het stoppen nog
moet gebeuren. Geen bug die dingen dubbel uitvoert, wel verwarrend. Issue aangemaakt,
nog niet gefixt: **#159**.

## 3. Vattenfall-thumbnails gemaakt en gezet

Nick vond de eerdere Fluke/toernooi-thumbnails leuk en wilde iets vergelijkbaars voor de
Vattenfall-uitzendingen: Pixar-stijl illustratie (personen rond een pooltafel, hapjes en
drankjes) in de Mokum-huisstijl (zwart/glossy paneel links met titel + logo, illustratie
rechts), met het Vattenfall-logo en de object-bal in Vattenfall-geel/blauw.

Belangrijkste iteraties tijdens de sessie:
- Prompts voor Google AI opgesteld (Pixar-stijl, Mokum-pand als achtergrond i.p.v. een
  generieke bar, bal-verhouding gecorrigeerd, blauwe lichtvervuiling vanaf het linker
  paneel weggehaald).
- Logo schoongemaakt (het aangeleverde PNG had geen echte transparantie, alleen een
  gebakken checkerboard-patroon) → opgeslagen als
  `vattenfall-logo-transparant.png`.
- Bal-kleurverdeling (geel/blauw) recht getrokken naar exact 50/50 met een eigen script
  (HSV-herkleuring binnen een ellipsmasker, met behoud van de originele
  schaduw/glans) — dit was ná een mislukte poging om de bal kleiner te maken via
  inpainting (het vilt liet dan een zichtbare naad zien; uiteindelijk via een
  aangepaste Google AI-prompt opnieuw laten genereren, wat wél schoon werkte).
- Eindlayout: `TAFEL {n}` (rood) / `VATTENFALL` (geel) / `BEGINNER`/`EXPERT` (blauw) /
  `TOERNOOI` (rood, kleiner) / `Live vanaf Mokum Pool & Darts`, met gelijke
  regelafstand.

**Resultaatbestanden** (buiten de repo, op Peters pc):
- `C:\PDS\06 Fotos en media\Google AI plaatjes\vattenfall-thumbnail-beginner.jpg`
  (Tafel 1)
- `C:\PDS\06 Fotos en media\Google AI plaatjes\vattenfall-thumbnail-beginner-tafel3.jpg`
- `C:\PDS\06 Fotos en media\Google AI plaatjes\vattenfall-thumbnail-expert.jpg`

**Op YouTube gezet** via `backend/src/youtube/videos.js` → `setThumbnail()` (rechtstreeks
aangeroepen vanuit een eenmalig scriptje, niet via de HTTP-API — zelfde werkwijze als
eerder bij de KWF-thumbnail, zie het geheugenbestand
`project_mokum_kwf_thumbnail_workflow`):

| Video | Video-ID | Thumbnail |
|---|---|---|
| Tafel 1 Vattenfall Beginner (1e) | `3BNOAbREBn4` | Beginner, Tafel 1 |
| Tafel 1 Vattenfall Beginner (2e) | `OfE62PusE5I` | Beginner, Tafel 1 |
| Tafel 3 Vattenfall Beginner | `qZAY96rDSno` | Beginner, Tafel 3 (gecorrigeerd — zie hieronder) |
| Tafel 1 Vattenfall Expert | `QWlNxDZGp2k` | Expert, Tafel 1 |

**Bijvangst/fout ontdekt en gecorrigeerd:** het eerste generatiescript had het
tafelnummer hardcoded op "1", waardoor de Tafel 3-video eerst een thumbnail kreeg met
"TAFEL 1" erop. Ontdekt door de live thumbnails van alle vier video's terug op te halen
en te vergelijken; script aangepast met een `tafel`-parameter, opnieuw gegenereerd en
gecorrigeerd gezet. Alle vier zijn nu bevestigd correct.

Het scriptje voor het zetten van de thumbnails is bewust NIET aan `backend/scripts/`
toegevoegd — eenmalig werk voor dit specifieke evenement, geen herbruikbare tool (zelfde
afweging als bij de KWF-thumbnail).

## Wat er nog open staat

- **#159** (Stop-knop zonder 'bezig'-feedback) — gediagnosticeerd, niet gefixt. Geen
  haast (prioriteit laag), maar leuk om een keer mee te nemen.
- Geen codewijzigingen in de repo deze sessie — alles was onderzoek (logs/Studio) en
  werk buiten de repo (afbeeldingen, eenmalige YouTube-API-scripts).

## Waar de kennis verder staat

- Issue #159 voor de Stop-knop.
- `docs/sessies/2026-09-22-bevroren-scorebord-handover.md` voor de vorige sessie
  (ander onderwerp, #153/#155).
- Geheugenbestand `project_mokum_kwf_thumbnail_workflow` voor de werkwijze rond
  eenmalige, aangeleverde thumbnails buiten de generatie-pipeline om.
