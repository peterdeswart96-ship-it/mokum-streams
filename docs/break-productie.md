# Break-productie — ontwerp-notitie (voor latere fase)

> Idee (2026-07-11, Nick/Peter): tijdens een **break op een tafel** het beeld leuker
> maken door af te wisselen tussen **Jumbotron** (alle scores), een **picture-in-picture
> van de andere live-tafels**, en een **pauzemelding**. Deze notitie legt de opzet vast;
> bouwen zodra de basis (overlay-automatisering) staat en de resource-headroom gemeten is.

## Onderdelen van de break-content
1. **Jumbotron** — alle 16 tafels met live stand + spelers (Cuescore venue-URL). Losse
   toggelbare browser-source. *(Wordt nu al als dashboard-schakelaar gebouwd.)*
2. **Pauzemelding** — tekst-/overlaymelding "We wachten op de volgende wedstrijd op
   Tafel N…". *(Nu als schakelaar; later dashboard-bewerkbaar / auto uit Cuescore-API.)*
3. **PiP van de andere tafels** — kleine live-beelden van de andere cameratafels in
   beeld. Dit vraagt om **NDI** (zie hieronder).

## PiP via NDI (de kern van deze notitie)
**Probleem:** elke tafel is een **aparte OBS-instantie op dezelfde pc**. Een fysieke
camera is exclusief — je kunt 'm niet in twee OBS-instanties tegelijk capturen. Dus
Tafel 3 kan niet zomaar de camera van Tafel 1 pakken.

**Oplossing: NDI** (Network Device Interface) — gratis OBS-plugin **DistroAV** (voorheen
obs-ndi):
- Elke tafel-OBS zet **NDI-output** aan (deelt z'n programma-beeld over het lokale netwerk).
- In de break-scène van een tafel voeg je **NDI-bronnen** toe voor de andere tafels →
  PiP van de andere live-tafels, laag in vertraging en scherp.

**Alternatief zonder plugin:** browser-source met de **YouTube-embed** van de andere
tafels. Werkt, maar **10-30s vertraging** + meer CPU + minder strak. NDI heeft de voorkeur.

## Resource-aandachtspunten ⚠️
4× 1080p60 NVENC-streams **+ NDI encode/decode** op één pc zit tegen de grenzen aan:
- Meet eerst de **CPU/GPU-headroom** met alles tegelijk aan (4 streams + NDI).
- Gebruik **NDI HX** (gecomprimeerd) en/of een **kleinere PiP-resolutie** om te sparen.
- Overweeg de PiP alleen tijdens breaks te activeren (niet permanent).

## Aansturing / automatisering
- **Nu / handmatig:** losse scènes of bronnen, bediend via **Stream Deck** (budget akkoord).
- **Break-rotatie automatisch:** de **agent** rouleert de break-content (Jumbotron ↔ PiP ↔
  pauzemelding) op een timer of **tussen wedstrijden** (Cuescore-API weet wanneer een tafel
  idle is). Vergt mogelijk een `setScene`-commando naast het bestaande `setOverlay`.

## Bouwvolgorde (voorstel)
1. ✅/▶ Jumbotron + pauzemelding als dashboard-schakelaars (overlay-model). — *nu*
2. Pauzemelding **dashboard-bewerkbaar** maken (gehoste overlay die de backend pollt).
3. **Resource-meting** op de OBS-pc (4 streams + NDI).
4. **NDI** installeren + per instantie output aan; break-scène met PiP van de andere tafels.
5. **Agent-break-rotatie** (timer of tussen-wedstrijden) — evt. `setScene`.

Zie ook [[cuescore-overlays]] (Jumbotron + tussen-wedstrijden-modus) en `docs/obs-standaard.md`.
