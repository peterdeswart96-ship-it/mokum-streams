# Handover — sessie 21 september 2026 (vastgelopen stream, agent-stop, jackpot-pil)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Vorige overdracht: `2026-09-17-competitie-thumbnail-stop-handover.md`.

## De rode draad

De sessie begon met een storing: Nick had 's ochtends de competitie-wizard getest met een
verborgen stream, die stopgezet, en tóch bleef die bijna een uur uitzenden zonder dat het
dashboard er nog een knop voor toonde. Die ene storing bleek **twee losse fouten** te bevatten —
een in de agent (de stop kwam niet aan) en een in het dashboard (de stream werd onzichtbaar).
Beide zijn gefixt, uitgerold en dezelfde dag in productie bewezen.

Daarna is de OBS-pc bijgewerkt — die bleek **70+ commits achter te lopen** — en is er een
jackpot-pil op de thumbnails gebouwd.

## 1. Storing: stream bleef doorzenden na een stop (#148, #149)

**Wat er gebeurde** (tijden lokaal, 21-09):

| Tijd | Gebeurtenis |
|---|---|
| 10:49:40 | Nick start tafel 1 via de competitie-wizard, verborgen, video `ZjKZLP1__84` |
| 10:49:53 | Stopt hem 13 seconden later via het dashboard |
| 10:50:13 | Backend finaliseert netjes (competitie-thumbnail) |
| — | OBS bleef doorzenden op 16 Mbps; YouTube stond bijna een uur "Live now" |
| 11:43 | Handmatig gestopt via `POST /api/manage/streams/stop` (dashboard had geen knop meer) |

**Oorzaak 1 — de agent (#149, gesloten).** `stopStream` in `agent/src/obs.js` las één keer
`GetStreamStatus` en deed niets bij `outputActive: false`. Bedoeld als "niets te stoppen", maar
die vlag staat óók op false in de seconden waarin OBS de RTMP-verbinding opbouwt. De agent
bevestigde het commando en OBS ging daarna alsnog de lucht in — waarna niets hem meer stopte
(op de nachtstop na, die ook enkel een stopStream in de rij zet).

*Fix:* de agent polt nu tot 12 seconden door als de tafel binnen 45 s geleden is gestart, en geeft
terug of er echt iets gestopt is. Een stop die niets aantrof wordt gelogd — precies het spoor dat
op 21-09 ontbrak.

**Oorzaak 2 — het dashboard (#148, gesloten).** `buildLiveTables` in `backend/src/public/live.js`
liet de store beslissen: `stopped: true` → status `offline`, punt. De terugval die dit moest
opvangen gold alleen als er *geen* store-entry was (de middernacht-rollover van v0.26). Juist het
gevaarlijkste geval — backend denkt gestopt, zaal zendt door — was daardoor het enige onzichtbare.

*Fix:* meldt de agent `streaming` of heeft YouTube een actieve broadcast, dan is de tafel `live`
en dus stopbaar, ongeacht de store. De werkelijkheid wint van de administratie. De tafelkaart
toont daarbij een oranje waarschuwing, want zo'n kaart heeft geen titel en was anders niet van een
gewone stream te onderscheiden. API-contract **v0.63**.

**Bewijs uit productie** (test door Peter, 21-09 12:38, uit `agent.log` op de OBS-pc, UTC):

```
[2026-09-21T10:38:57.900Z] [OK] startStream tafel 1
[2026-09-21T10:38:58.409Z] [OK] stopStream tafel 1
```

Geen "— OBS zond niet (niets gestopt)" achter de stopregel, dus er is écht iets gestopt. En 509 ms
ertussen, terwijl de wachtlus in stappen van 500 ms polt: exact één ronde wachten. De oude code
was bij die eerste `false` gestopt met proberen. Ter vergelijking het falende geval van die ochtend:
`08:50:24.097 startStream` → `08:50:24.102 stopStream`, 5 ms, geen wachtlus.

Peter zag tijdens die test kort de nieuwe oranje waarschuwing — dat is #148 die precies doet wat
hij moet doen in het gat tussen de stop en het moment dat OBS stil is.

## 2. De OBS-pc liep 70+ commits achter

De repo op de streaming-pc stond op `6c1b479`, niet op main. Bijgewerkt naar `b728156` en
`MokumAgent` herstart. Dat betekent dat de agent daar **wekenlang oude code draaide** — behalve
#149 kwam daardoor nu pas ook `d97b9f8` binnen (de overlaybron `Competitiestand` van #147).

**Les:** een agent-wijziging is pas actief na een handmatige `git pull` + herstart op die pc; er is
geen CI/CD naartoe. Neem dat op in het uitrolplan van elke agent-wijziging.

De juiste stappen (pad is `C:\mokum-streams`, niet wat je zou gokken):

```powershell
git -C C:\mokum-streams status          # eerst: lokale wijzigingen?
git -C C:\mokum-streams checkout main
git -C C:\mokum-streams pull origin main
Stop-ScheduledTask  -TaskName 'MokumAgent'
Start-ScheduledTask -TaskName 'MokumAgent'
```

Details die tijd kostten:
- De geplande taak start `C:\mokum-streams\agent\run-agent.cmd`; die logt naar
  **`C:\mokum-streams\agent\agent.log`** (append). Dat logbestand is de enige plek waar te zien is
  of een commando is uitgevoerd, gedropt of mislukt.
- `npm ci` kan beter overgeslagen worden bij een wijziging zonder nieuwe packages: het wist eerst
  `node_modules`, en PowerShell weigert daar `npm.ps1` door de execution policy (`npm.cmd` werkt wel).
- `LastTaskResult: 267009` (`0x41301`) betekent "taak draait nu" — geen fout.
- **Overdag pollt de agent elke 60 s** in plaats van elke 3 s, zolang er nergens gestreamd wordt
  (`isDrukkeTijd` + `POLL_MS_RUSTIG_FACTOR` in `agent/src/agent.js`). Bij een test overdag duurt
  het dus tot een minuut voor er iets gebeurt; 's avonds is het 3 s.

## 3. Jackpot-pil op de thumbnails (#150, open tot de eerste echte thumbnail)

Bij meerdere toernooien is er een extra jackpot te winnen. Die staat nu op de thumbnail van
**alle MEGA rankings en de Fluke ranking** (`heeftJackpot()` in `backend/src/video/detectie.js` —
de lijst met templatekeys is de enige plek om aan te passen).

Weg van drie doodlopende wegen, in deze volgorde:
1. **Rechtsboven** kan niet: daar zit bij een finale het FINAL-lint (#123).
2. **Rechtsonder in de hoek** (eerste wens) bleek onbruikbaar: YouTube legt daar in elk overzicht
   de duurchip overheen, precies over het woord JACKPOT. Aangetoond met een proefrender waarin die
   chip op schaal is meegetekend.
3. **Een vierkante badge van 95px** naast de datum was leesbaar in de video, maar in het
   kanaaloverzicht (320px breed) viel het woord weg.

Eindvorm: een **rode pil** naast de datumpil, met het woord JACKPOT en de geldzak erachter. Vorm en
maten zijn exact die van de datumpil uit de sjablonen (ronding, padding, lettergrootte, Anton),
zodat de twee als één familie lezen. Alleen de geldzak is een plaatje
(`backend/assets/jackpot-geldzak.png`).

Drie dingen die bij het bouwen tijd kostten en het onthouden waard zijn:
- Het door Google AI geleverde plaatje was een **JPG met een getekend schaakbordpatroon** in plaats
  van echte transparantie. Omgezet naar PNG met alfakanaal via een flood-fill vanaf de rand, plus
  drie rondes halo-verwijdering voor het roze JPEG-randje langs de rode rand.
- De geldzak is uit die badge geknipt met een flood-fill op **goudtint** (`g > b + 30`); rood en het
  roze randje vallen daarmee af, terwijl de witte highlight ín de zak blijft omdat die van buitenaf
  onbereikbaar is.
- De datumpil groeit mee met de lengte van de datum ("DI 8 JULI" vs "WO 23 SEPTEMBER"), dus de plek
  van de pil wordt **tijdens het renderen gemeten** (`plaatsBadgeNaastDatum` in `thumbnailHtml.js`),
  ná het laden van de fonts. De CSS-waarden zijn alleen nog terugval.

Proefrenders staan in `C:\PDS\06 Fotos en media\Google AI plaatjes\jackpot-proef\` (buiten de repo).

## 4. Dode overlay 'Pauzemelding' ontdekt (#151, nog niet opgepakt)

Uit `agent.log` bleek dat bij **elke** streamstart een commando wordt gedropt:
`[DROP] setOverlay tafel 1: bron 'Pauzemelding' niet gevonden in scène 'Scène'`.

De OBS-bron `Pauzemelding` bestaat in geen enkele instantie meer; de pauze-slides zitten nu in de
`Jumbotron`-bron. Het automatische pauzescherm werkt gewoon, want in productie staat
`PAUZESCHERM_KEYS=jumbotron`. Maar: de dashboardknop "Pauzemelding" doet stil niets, en de
code-default van `pauzeSchermKeys()` is nog `['pauzemelding']` — haalt iemand die app-setting weg,
dan valt het pauzescherm stil op een bron die niet bestaat. Besluit Peter: opruimen. Zie #151 voor
alle vindplaatsen.

## Besluiten van Peter

- **Jackpot-pil:** rood (niet zwart met rode rand), naast de datum, half zo groot als de eerste
  badge. De positie rechtsonder is verlaten vanwege de YouTube-duurchip.
- **Jackpot geldt voor:** alle MEGA rankings + de Fluke ranking.
- **Merge naar main:** expliciet akkoord gegeven voor beide merges van deze sessie
  (`b728156` voor #148/#149, `62d22d0` voor #150).
- **Pauzemelding:** opruimen in plaats van de OBS-bron alsnog aanmaken (#151).
- De start/stop-test is bewust overdag gedaan in plaats van 's avonds tijdens de competitie.

## Nog open

- **#150** — open tot er na een echte MEGA of Fluke ranking een thumbnail mét pil in het kanaal
  staat (werkafspraak 9). Code staat live; het eerstvolgende zo'n toernooi is de test.
- **#151** — Pauzemelding opruimen. Peter pakt dit op in een verse chat.
- **#147** — competitiescherm: de randvoorwaarden staan nu klaar (agentcode op de pc, OBS-bron
  `Competitiestand` in alle vier met URL `/competitie/?tafel=N`). De echte test is de
  competitieavond van 21-09. Zie de comment in dat issue.
- Uit eerdere overdrachten ongewijzigd: #145 (inplannen), #146, #140, #131, #132, #133.

## Waar de kennis staat

- #148 en #149 — beide gesloten, mét het logbewijs uit `agent.log` in de afsluitende comment
- #150 (jackpot-pil), #151 (Pauzemelding opruimen), #147 (comment over de randvoorwaarden)
- `docs/api-contract.md` v0.63
- `backend/src/public/live.js` (`buildLiveTables`), `agent/src/obs.js` (`stopStream`),
  `backend/src/video/thumbnailHtml.js` + `detectie.js` (`heeftJackpot`)
- Tests: `backend/test/liveVideos.test.js`, `public.test.js`, `thumbnailHtml.test.js`,
  `detectie.test.js`, `agent/test/obs.test.js`
