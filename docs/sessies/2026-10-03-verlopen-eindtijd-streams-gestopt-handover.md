# Overdracht 03-10 (middag) — alle tafels onverwacht gestopt door verlopen eindtijd (#171)

## Context
Dag 2 van het OnePocket.org-weekend (hoofdtoernooi 74776897, tafel 1, 3, 15, 16). Peter meldde
dat de streams op alle tafels gesloten waren en dat hij er al drie had herstart (tafel 15 was niet
nodig). Aanvulling op [2026-10-03-onepocket-thumbnails-ticker-handover.md](2026-10-03-onepocket-thumbnails-ticker-handover.md).

## Rode draad
Het planning-record van het meerdaagse toernooi stond nog op dag 1. De eindtijd (`stopOverride`)
was 2026-10-03T00:30Z, dus nacht 2→3 okt, en lag op dag 2 al ruim in het verleden. `checkStops`
gebruikte die tijd telkens opnieuw als reden om te stoppen. Het was geen agent- of OBS-storing.

## Oorzaak (uit logs, broadcast-store en code)
- Record 74776897 in `planning.json`: `date` 2026-10-02, `startOverride` 2026-10-02T09:00Z,
  `stopOverride` 2026-10-03T00:30Z, `planned: false`. De streams zijn handmatig gestart (08:46Z),
  dus de planner zelf deed niets.
- `stopReden()` in `backend/src/planning/stop.js` kijkt niet of een `stopOverride` vóór de start
  van de uitzending ligt.
- De regel "lopende wedstrijd nooit afkappen" (#76) beschermt alleen zolang Cuescore `playing`
  meldt. Tijdlijn (UTC): 09:45 tafel 15 gestopt (niets bezig); 10:12 Cuescore-time-out
  (`tournament = null`) → bescherming weg → tafel 1, 3 en 16 tegelijk gestopt; Peter startte
  opnieuw; tafel 1 werd opnieuw gestopt om 11:12, 11:13 en 11:51.
- Dat de eerste stops pas om 09:45 en 10:12 vielen, past bij de beschermde partijen. Wat er zonder de
  Cuescore-time-out was gebeurd weten we niet zeker.

## Wat er is gedaan
- Alleen onderzoek, geen codewijziging. Er liepen streams.
- Tijdelijke fix door Peter, met een PowerShell-commando dat ik gaf: `stopOverride` van het record
  op 2026-10-03T23:30Z (01:30 lokaal, nacht 3→4 okt). Daarna gecontroleerd in de blob: alleen dat
  veld was gewijzigd en er kwamen geen stopcommando's meer. Tafel 1 is daarna door Peter hervat.
- Issue **#171** aangemaakt met de volledige analyse en de structurele fix.
- Korte samenvatting voor Nick en Mark opgesteld (alleen in de chat).
- Item toegevoegd aan [../faq-storingen.md](../faq-storingen.md).

## Besluiten / afspraken
- **Bank Pool (20:00, tafel 1 en 3):** om 19:30 maakt `TAFEL_VRIJMAKEN` die tafels vrij en stopt de
  OnePocket-stream daar, ook als er nog gespeeld wordt (de wizard waarschuwt hiervoor, #146). Peter
  belt rond 18:00 met Nick en Mark om de tafels vrij te houden. Geen planning gewijzigd.
- Structurele fix nog niet gebouwd: Peter moet nog akkoord geven.

## Wat er nog open staat
- **#171:** (1) `stopOverride` van vóór de start negeren, (2) `mergePlanning` overrides laten
  meeschuiven als Cuescore de datum verzet (samen met #170), (3) uitzoeken of het Eind-veld in de
  planner een tijd voor een andere dag goed wegschrijft (de planner toonde "02:30" zonder datum; of
  Peter de aanpassing in het scherm probeerde is niet vastgesteld), (4) overwegen: bij Cuescore-time-out
  niet stoppen op alleen een eindtijd.
- **Dag 3 (4 okt):** het record staat nog op dag 1 (`date` 2-10, `startOverride` 2-10). Vóór het starten
  van de streams de eindtijd weer naar de toekomst zetten, anders gebeurt het opnieuw.
- **#170:** fix staat nog op `fix/planning-datum-verversen` (`fe8f62b`), niet gemerged of gedeployed.
- Tafel 3 en 16 liepen nog toen de fix erin ging; tafel 1 is door Peter opnieuw gestart. Of de
  streams de avond doorkwamen, staat hier niet.

## Waar de kennis verder staat
- Issue #171 (en #170, #146, #76 voor de regel die niet beschermde).
- `backend/src/planning/stop.js` (`stopReden`), `backend/src/functions/checkStops.js`,
  `backend/src/planning/planning.js` (`mergePlanning`).
- Logs: gedeelde Log Analytics-werkruimte, filteren op `[checkStops]` / `[streams/`.
- Broadcast-store lezen: `az storage blob download … --auth-mode key` (zie geheugen).
