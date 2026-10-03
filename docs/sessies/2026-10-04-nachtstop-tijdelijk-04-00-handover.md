# Overdracht 04-10 — nachtstop vanavond tijdelijk naar 04:00

## Context
Het toernooi van zondag 04-10 (dag 3, finale hoofdtoernooi) loopt naar verwachting later dan
03:00. Peter wil daarom dat de nachtstop vanavond pas om 04:00 komt. Geen codewijziging nodig.

## Tijdelijke afwijking (TERUGZETTEN!)
- App-setting `NACHT_STOP_SLUITING_MIN` gaat van 180 (03:00) naar **240 (04:00)**.
  Code: `backend/src/functions/nachtStop.js` regel 16; zonder deze setting is de standaard 180.
- De timer draait elke 30 min (:00 en :30): de stop valt dus tussen 04:00 en 04:29.
- Peter zet de setting zelf (schrijfacties naar productie worden geweigerd):
  `az functionapp config appsettings set --resource-group rg-mokum-streams --name <function-app> --settings NACHT_STOP_SLUITING_MIN=240`
- **Na afloop terugzetten** op 180, of de setting verwijderen. Anders blijft het vangnet ook de
  komende avonden op 04:00.

## Valkuilen
- Een app-setting wijzigen herstart de Function App kort. De OBS-streams lopen door, maar de timers
  slaan even een tik over. Dus niet midden in een wedstrijd zetten.
- De **eigen eindtijd uit de planner** (standaard 01:30) stopt de stream eerder dan de nachtstop.
  Voor dit toernooi ook in de planner een latere eindtijd zetten (bijv. 03:45).
- Agent-offline-alarmen zijn tussen 01:00 en 07:00 stil (#132): valt de OBS-pc vannacht uit, dan
  volgt de melding pas om 07:00.

## Status
- [x] Setting op 240 gezet (Peter, 04-10, gecontroleerd met `appsettings list`)
- [ ] Eindtijd in planner verruimd (Peter)
- [ ] Setting teruggezet op 180 na het toernooi
