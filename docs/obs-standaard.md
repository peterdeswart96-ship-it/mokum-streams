# OBS-standaardisatie — Mokum Streams

Richtlijn om de **4 portable OBS-instanties identiek** in te richten. Dat maakt de
agent-aansturing uniform (dezelfde bronnamen op elke tafel), minder foutgevoelig
en makkelijker te onderhouden. Doen **vóór** de eerste test/uitrol, in overleg
met Nick.

## Waarom standaardiseren
- **Eén set bronnamen** → de agent gebruikt overal dezelfde namen; onze
  standaard-overlaynamen (`Sponsors`, `cs score`) kloppen dan op elke tafel en er
  is geen per-tafel uitzondering meer nodig.
- Voorspelbare automatisering, minder "werkt op tafel X maar niet op Y".
- Nu wijken de namen per instantie af (screenshot: `gO`, `sPON`, `bUFFAL`,
  `KaMUI`) — dat willen we gelijktrekken.

## Standaard per instantie (identiek — behalve het tafelnummer)
| Onderdeel | Standaard (op elke instantie gelijk) |
|---|---|
| **Sponsors-groep** | `Sponsors` |
| **Scoreboard (Cuescore)** | `cs score` |
| **Sponsorlogo's** | `Buffalo`, `Kamui`, `GO Customs`, `Mokum`, `Modern` (consistente casing) |
| **Camerabron** | `Camera` (of laat staan — de agent raakt de camera niet aan) |
| **Scène** | zelfde naam op alle, bijv. `Tafel` |
| **obs-websocket** | aan; **eigen poort** per instantie (4455 / 4456 / 4457 / 4458) + eigen wachtwoord |
| **Stream key** | de herbruikbare liveStream van díe tafel (`Mokum Streams — Tafel N`) |
| **Output** | zelfde resolutie/bitrate op alle (bijv. 1080p, ~5000 kbps) |

> De agent schakelt alleen de **overlays** (`Sponsors`, `cs score`) en de stream;
> als die twee namen overal gelijk zijn, werkt de default zonder per-tafel config.

## Tafelnummer zichtbaar maken (jouw punt)
Nu staat nergens welk tafelnummer het is. Drie lagen, van belangrijk naar optioneel:
1. **Kijkers**: zien het al in de **YouTube-titel** (`Tafel {nr} {toernooinaam}`) — dat regelt ons systeem automatisch.
2. **Operationeel op de OBS-pc**: benoem per instantie het **profiel / Scene
   Collection** naar de tafel (nu "Untitled"/"Naamloos" → `Tafel 3`, `Tafel 16`,
   …). Dan zie je in de titelbalk meteen welke instantie welke tafel is.
3. **Optioneel op beeld**: een kleine tekstbron `Tafelnummer` met "Tafel N" in de
   scène. Dit is dan het **enige bewuste verschil** tussen de instanties.

## Meteen meenemen (aanraders)
- **"Begint zo"-scène** per instantie (zelfde naam, bijv. `Begint zo`) voor de
  **pre-roll** — dan kan de agent straks bij de start van "begint zo" naar de
  tafelscène wisselen.
- **Consistente audio-opzet** (voor later commentaar; nu geen muziek).
- **OBS-mappen buiten OneDrive** zetten (zie `wiki/gaps.md` #9) — voorkomt
  sync-/vergrendelingsproblemen.

## Aansluiting op de code
- De agent-default overlaynamen staan in `backend/src/agent/commandQueue.js`
  (`OVERLAY_BRON = { sponsors: 'Sponsors', scoreboard: 'cs score' }`). Als je de
  bronnen zo noemt, is er **geen per-tafel override** nodig. Een afwijkende naam
  kan altijd nog per tafel in `config/tables.json` (`overlaySources`).
