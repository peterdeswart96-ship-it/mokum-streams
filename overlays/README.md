# Jumbotron QR-overlay

Overlay met een QR-code die naar de **venue-Jumbotron** wijst (alle tafels live).
Kijkers scannen 'm en zien de standen op hun telefoon. Zelfde op alle 4 tafels.

QR wijst naar: https://cuescore.com/venue/table/jumbotron/?venueId=60451687&branchId=1

## Gebruiken in OBS
- **Optie A (aanrader):** `qr-jumbotron.html` als **Browser-source** (Local file aanvinken
  → dit bestand kiezen). Zelfstandig (QR ingebakken), transparante achtergrond, met tekst.
  Grootte bijv. 520x220. Positioneer in een hoek.
- **Optie B:** `qr-jumbotron.png` als **Image-source** (alleen de QR, tekst er los bij).

## URL wijzigen
Pas `URL` in `overlays/gen-qr.js` aan en genereer opnieuw (`node gen-qr.js` met het
qrcode-pakket), of vervang de QR via een generator.
