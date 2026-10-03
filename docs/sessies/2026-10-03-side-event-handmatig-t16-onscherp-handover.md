# Overdracht 03-10 (avond) — Bank Pool side-event vroeger gestart, T16 weer onscherp (#158)

## Context
Zelfde dag als [2026-10-03-verlopen-eindtijd-streams-gestopt-handover.md](2026-10-03-verlopen-eindtijd-streams-gestopt-handover.md).
Het Bank Pool side-event begon om 18:15, ruim vóór de geplande 20:00. Peter heeft de geplande
stream geannuleerd en de streams op tafel 1 en 3 handmatig gestart. Daarna kwam het T16-beeld ter
sprake. Alleen onderzoek, geen codewijziging; er liepen streams.

## Rode draad
1. Handmatige streams op T1/T3 worden niet geraakt door de finale-sluiting van het hoofdtoernooi
   (OnePocket, T16); die finale is bovendien pas morgen.
2. T3 was even gesloten en is daarna via het dashboard opnieuw gestart, nu mét registratie.
3. T16 is vanavond onscherp, terwijl het eerder op de dag scherp was. Oorzaak ligt vóór OBS.

## 1. Handmatige streams en de finale-sluiting (#72)
Uit de code gelezen (niet in productie bekeken):
- `stopReden()` in `backend/src/planning/stop.js` slaat streams met `adhoc` over (regel 48).
  De finale-sluiting (#72, regel 73-84) kijkt alleen naar de finale van het toernooi waaraan de
  stream zelf gekoppeld is (`entry.tournamentId`). De finale van het hoofdtoernooi sluit een
  side-eventstream dus niet.
- Een handmatige stream wordt via `kiesToernooiVoorTafel()` in `backend/src/planning/koppel.js`
  (#69) alsnog gekoppeld als het toernooi vandaag wedstrijden op die tafel heeft. De titel moet ook
  minstens één betekenisvol woord delen met de toernooinaam. "SIDE-EVENT | Bank Pool" deelt niets
  met de naam van het hoofdtoernooi, dus die koppeling wordt geweigerd.
- Zolang het hoofdtoernooi nog niet-afgeronde wedstrijden op een tafel heeft, sluit een gekoppelde
  stream daar niet (`anderToernooiNogOpTafel`).
- De finale van het hoofdtoernooi is pas morgen (zondag 04-10, dag 3). Vanavond speelt deze
  vraag dus niet; morgen geldt #72 gewoon voor streams die aan het hoofdtoernooi gekoppeld zijn.
- Gevolg: T1 en T3 stoppen na de finale van het side-event zelf (mits gekoppeld), met podium,
  thumbnail en hoofdstukken. Is een stream niet gekoppeld, dan stopt Peter hem zelf; het vangnet
  is de nachtstop van 03:00.

## 2. T3: onbeheerd na een rechtstreekse start
Op het dashboard stond bij T3 de waarschuwing "Zendt uit zonder lopende uitzending in het
systeem". Peter had de stream gestopt en later opnieuw gestart via "Nieuwe stream". Daarna stond
T3 live met titel "Tafel 3 SIDE-EVENT | Bank Pool", YouTube-link en scorebord uit Cuescore (Round 1).
Een stream die rechtstreeks in OBS start, is niet geregistreerd en dus onbeheerd. Altijd via het
dashboard starten, met een titel die een woord deelt met het toernooi.

## 3. T16 onscherp (#158)
Eerder op de dag was T16 scherp; vanaf ~20:45 onscherp. Dat past niet bij de "algemene zachtheid"
van 26-09 en lijkt dus intermitterend. Uitgesloten:
- **YouTube-speler:** 1080p, optimaal = huidig, 17 van 1568 frames dropped, buffer 18 s, 25,9 Mbps.
- **OBS:** CPU 2-3%, 0 skipped (encoding), 0 dropped (netwerk), 16 van ~1,1 mln missed (render),
  15-17 Mb/s.
- **Schijf:** C: heeft 812 GB vrij. De rode "0,0 MB" in OBS-Stats is het opnamepad (er is geen
  opname actief), cosmetisch.
- De **OBS-preview is zelf al onscherp** → het verlies zit vóór OBS (camera of camerastroom).
  Lanczos op de bronnen (26-09) loste dit dus niet op.

Peter kon vanavond niet bij UniFi Protect. Bevindingen staan als comment in #158.

## Besluiten
Geen nieuwe besluiten. Peter wil geen bronnen in OBS aanpassen zolang T16 voor het hoofdtoernooi
live is.

## Wat er nog open staat
- **#158:** UniFi Protect-live view van de T16-camera op High bekijken en naast T15 leggen; lens
  controleren (vuil/focus); bron-URL in OBS nakijken (lager kwaliteitskanaal na reconnect?); daarna
  sluitertijd/ruisonderdrukking/WDR en bitrate/H.265 (#32).
- Opgelost: het scorebord op het T16-beeld toonde "SIDE-EVENT | BANK POOL – Round 1 – Tafel 16",
  terwijl T16 voor het hoofdtoernooi is bedoeld. Dat was een fout van Peter (verkeerde
  scorebordbron). Peter heeft de T16-stream daarna herstart. Of het beeld daarna scherper was, is
  nog niet bekend; noteer dat in #158.
- Peter stopt T1/T3 zelf als de automatische stop na de side-event-finale niet gebeurt; controleer
  de volgende ochtend of de streams zijn gestopt, gefinaliseerd en van thumbnail voorzien.
- Optioneel: het opnamepad in OBS rechtzetten (zie boven).

## Waar de kennis verder staat
- Issue #158 (comment van 03-10), #171, #72, #69.
- [../faq-storingen.md](../faq-storingen.md) — nog geen punt toegevoegd; #158 is nog niet opgelost.
