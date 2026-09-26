# Overdracht 26-09 (avond) — live-alarm (#131), ververs-knop (#99), rebuild-droogloop (#161/#140), podium-fix (#162), OBS-bronnen (#98)

Vervolg op `2026-09-26-vangnetten-archief-en-scherpte-handover.md` (dezelfde dag, eerder). Aanleiding:
Peter vroeg welke openstaande issues Claude zelfstandig kon uitvoeren. Tijdens de sessie liep de finale van
de Mokum 8ball Ranking Seizoen 4 #3 live (tot ~19:13); **niets mocht die stream raken**, dus alles is eerst
lokaal gebouwd en pas na de finale gedeployed. Alles staat op **main** (PR #163, merge `cb1b30a`);
`/api/health` meldde daarna `commit: cb1b30a`. Alleen de laatste docs-commit (`fbd2ebf`, #98) staat nog
op develop en gaat mee met de volgende merge.

## Rode draad

Twee dingen bleken echte gaten (#131, #99), één bleek een echte bug die we pas zagen doordat de
finale live liep (#162, medaillescherm bleef weg). De rest was opruimen en bewijs verzamelen. Drie
issues die als "open werk" begonnen bleken al klaar (#150, #152, #159) — dat is voor de derde keer een
les: **lees eerst de code en de comments, dan pas voorstellen** (zie Valkuilen).

## 1. #131 — alarm als YouTube de uitzending niet live zet

**Gat:** het herstart-vangnet (#114, `planning/herstart.js`) en het alarm van 12-09 kijken alleen naar wat de
**agent** meldt. Op 16-09 meldde de agent `streaming: true` terwijl YouTube tafel 3 op "Upcoming" liet staan
(nieuwe broadcast gebonden aan een al-actieve stream key) — zwart beeld tot iemand het zelf zag.

**Oplossing:** `backend/src/planning/liveBevestiging.js` (pure logica, 9 tests in `test/liveBevestiging.test.js`),
ingehaakt in `functions/checkStops.js` (net vóór het "handmatig gestart zonder toernooi"-blok). Zendt de agent
en is de geplande start > 10 min geleden, dan vraagt checkStops bij YouTube (`getVideoDetails`, 1 quota-eenheid)
of er een `actualStartTime` is. Zo niet: **eenmalig alarm** (mail + ntfy, `bouwNietLiveOpYoutubeAlert` in
`notify/alertBericht.js`). Wel: `ytLiveBevestigd` op de entry, dus geen nieuwe aanroepen. Alleen een melding,
géén automatische actie (herstart terwijl OBS wél zendt kan een werkende uitzending verstoren).
Schakelaar `LIVE_CONTROLE` (standaard aan, `false` zet uit) in `config/automation.js`.

**Niet gedaan / open:** geen integratietest voor de checkStops-koppeling (alleen de pure logica). De
gecontroleerde test van de oorzaak (broadcast binden aan een key waar al data op staat) kan alleen op de
zaal-pc buiten een uitzending. **#131 blijft open** tot een echte avond zonder vals alarm en/of die test.

## 2. #99 — overlays op afstand verversen

Was **niet** al gedekt (mijn eerdere aanname klopte niet): `refreshSource` bestond als commandotype, maar er
was geen ingang. Nu: `POST /api/manage/streams/refresh` (contract **v0.68**) met `{ tableNumber: n | "alle",
bronnen?: ["scoreboard","jumbotron"] }`. Alleen die twee bronnen mogen (`REFRESH_SLEUTELS` in
`agent/commandQueue.js`); `"alle"` = cameratafels 1/3/15/16. Dashboard: knop "↻ Ververs beeldbronnen" per
tafelkaart (8 s vergrendeld, bevestiging bij een live tafel omdat het scorebord ~1 s uit beeld is) en een
knop voor alle tafels onder de kaarten. Audit-regel op warning-niveau (`[streams/refresh]`). 6 tests
(`test/refreshBronnen.test.js`). De agent kende `refreshSource` al, dus **op de OBS-pc hoefde niets te
veranderen**. **#99 blijft open** tot getest op een echte tafel zonder live stream.

## 3. #140 / #161 — archief-rebuild: droogloop en besluit om niet te rebuilden

Claude mocht de productie-aanroep `POST /api/manage/archief/rebuild` niet uitvoeren (auto-mode-classifier
weigerde, **ook met twee allow-regels van Peter** — zie Valkuilen). Peter koos route B in #161: een droogloop.
`?dryRun=1` (contract **v0.69**, `functions/archief.js`) doet alles behalve wegschrijven en geeft nu altijd
`huidig` (aantal in het bestaande archief) terug.

**Uitkomst (na de deploy):** `huidig 1914` tegen `wedstrijden 1909`. Lokale vergelijking (alleen gelezen,
zonder duurcheck): nieuwe lijst 1949; **3** archiefwedstrijden vallen weg (oude video's met alleen namen:
22-04 Elton Kamami – M .A Alfons, 04-01 Walid 7 – Dave Groot, 30-08-2025 Lennert Duyn – Mostafa), 2
toernooien zijn niet op te halen (88433578, 88433575); de rest van het verschil is de duurcheck (zo
bedoeld). Ter vergelijking: 17-09 vielen er 85 weg door hernoemde spelers — de matchId-fix werkt dus.
**Besluit Peter: rebuild overslaan, #140 en #161 gesloten.** Het archief van 1914 blijft; wie ooit een
rebuild draait: eerst `?dryRun=1` en `wedstrijden` vergelijken met `huidig`. Back-up van 1914 staat alleen
lokaal (`%TEMP%\mokum\`) — niet meer nodig.

## 4. #162 — medaillescherm bleef weg (de league wiste het podium)

**Symptoom (26-09, na de finale):** geen medaillescherm op tafel 1, terwijl de stream nog ~3 min doorliep.

**Bewijs (eerst de data, dan de verklaring):** het podium bestond (`live-matches.json` 19:10; Jumbotron aan
19:10:40 volgens `pauze-state`), `/api/live` had `podium` (zaalbreed) gevuld maar **`podiumPerTafel` overal
`null`**. De Jumbotron met `?tafel=N` leest uitsluitend `podiumPerTafel[N]` (in OBS bevestigd: alle vier de
bronnen hebben `?tafel=N`). Gereproduceerd met de echte Cuescore-data: mét de 14.1 Summer league →
`1:null 3:null 15:null 16:null`; zonder → tafel 1 en 3 hebben het podium.

**Oorzaak:** `podiumPerTafel` (`planning/podium.js`) loopt over alle toernooien van vandaag, "laatste wint".
De **14.1 Summer league** staat het hele seizoen als `Active` in de lijst met wedstrijden uit eerdere dagen op
alle cameratafels; hij kwam ná de Ranking, heeft zelf geen finale (waarde `null`) en overschreef zo het podium
op tafel 1 en 3. De bestaande regel (#104) sloeg alleen toernooien met `finished === true` over; de Ranking
stond in Cuescore nog op `finished:false`.

**Fix (`9e71c1a`):** een toernooi zonder podium wist een bestaand podium op een tafel alleen als er op
**die tafel nu een wedstrijd speelt** (`speeltNuOpTafel`). De 05-09-tests blijven kloppen; 3 nieuwe tests.
Met de nieuwe code geeft de data van vanavond het podium op tafel 1 en 3. **#162 blijft open** tot een
toernooiavond waarop het medaillescherm daadwerkelijk verschijnt.

## 5. #98 — OBS-bronnen vastgelegd

Het script `agent/scripts/obs-bronnen-uitlezen.js` (alleen lezen, via de OBS-websocket; klaar sinds 24-09)
is op de OBS-pc gedraaid. Uitvoer staat in `docs/obs-standaard.md`, sectie **"Bronnen per tafel"**:
URL, afmeting, verversinstellingen, Cuescore-`tableId` per tafel, custom css, het herhaalcommando. Kringverwijzing
naar #39 is weg. **Let op:** de intro gebruikt `?table=N`, alle andere pagina's `?tafel=N`.
Peter heeft daarna in OBS gelijkgetrokken: `Camera Tafel 15` op slot, Scoreboard-css op alle vier de tafels
gelijk (`body { background-color: rgba(0,0,0,0); margin: 0px auto; overflow: hidden; }`),
`Competitiestand` tafel 16 op slot. Resterend (onschuldig, bewust gelaten): Jumbotron-css op tafel 15 heeft een
bredere selector; scènenaam `Scene` op tafel 15. **#98 gesloten.**

## 6. Al klaar bleken — gesloten met bewijs

- **#150** (jackpot-pil op de thumbnail): al gedaan in `f93d710`/`62d22d0`; Peter bevestigde het.
- **#152** (dode rotatie-tak): al gedaan in `9226378`, op main; na de agent-herstart meldde de agent
  `[CONFIG] onbekend veld 'rotations'` — de nieuwe logregel bewijst dat de code draait.
- **#159** (Stop-knop feedback): al gedaan in `08f5f30`, op main en develop. **Nog open** tot een test in de
  browser (werkafspraak 9).

## OBS-pc bijgewerkt

`git pull` naar main (`2103823`, dus de agent-wijzigingen t/m #152) en `MokumAgent` herstart na de finale;
daarna meldden alle vier de OBS-instanties zich verbonden. **`agent\run-agent.cmd` staat NIET in git** (het
startscript van de taak, met wachtwoorden) en mag niet verwijderd worden. Deze sessie bevat géén agent-wijziging
meer: #131/#99/#161/#162 zijn alleen backend/frontend.

## Besluiten van Peter

- Rebuild niet draaien; #140 en #161 sluiten (route B was het gekozen pad in #161).
- Alles naar main via PR #163 (expliciet akkoord; werkafspraak 2).
- #154 (eigen scorebalk) blijft zonder prioriteit (besluit uit de eerdere overdracht van vandaag).

## Valkuilen (kostten tijd)

- **De auto-mode-classifier weigert productie-schrijfacties, óók met allow-regels.** De rebuild werd twee
  keer geweigerd, ook na `PowerShell(az functionapp config appsettings list:*)` en
  `PowerShell(Invoke-RestMethod:*)`. De droogloop (leest, schrijft niets weg) ging wél door. Ontwerp acties
  die iets in productie wijzigen daarom met een `dryRun`, of laat Peter ze zelf draaien met een kant-en-klaar
  commando. Niet omzeilen.
- **Niet aan de live stream komen.** Tijdens de finale: alleen lokaal bouwen, geen deploy, geen aanroepen
  naar productie die schrijven, geen agent-herstart. Pas na `stopped` + `finalized` van alle tafels
  (`broadcasts/<datum>.json`) en `streaming:false` in `status.json`. Rebuild schrijft `archief.json`, net als
  finalize — nooit tegelijk.
- **Lees eerst de code en comments, dan pas een issue als "open werk" voorstellen.** #150, #152 en #159
  bleken al klaar; ook bij #99 was mijn eerste inschatting ("waarschijnlijk al gedekt") fout, de andere kant op.
- **Diagnose: eerst de data.** Bij #162 kwam de oorzaak pas uit reproduceren met de echte Cuescore-data
  (`getTodaysTournaments` + `podiumPerTafel` lokaal), niet uit redeneren over de code.
- **CRLF:** alle broncode en docs zijn CRLF. Patchscripts (Write-tool + `node`) die `\r\n` splitsen en weer
  samenvoegen werkten betrouwbaar; controleer met `grep -c -v $'\r$' <bestand>` (moet 0 zijn).
- **`npm test` en `npm run lint` in `backend/`:** `node --test test/` als pad faalt; gebruik `npm test`. De
  frontend heeft geen lint-script (alleen `npm run build`). De agent heeft geen ESLint-config.
- **Lokaal Cuescore/Azure lezen** kan met `STORAGE_CONNECTION` uit `az storage account show-connection-string`
  in de omgeving van het proces (niet tonen, daarna `unset`).

## Wat er nog open staat

1. **Bewijs op een echte toernooiavond:** #131 (geen vals "niet live"-alarm; log `[ALARM] … YouTube staat niet
   live`), #99 (ververs-knop op een tafel zonder live stream testen), #162 (medaillescherm verschijnt;
   `podiumPerTafel` gevuld in `/api/live`), #159 (Stop-knop in de browser).
2. Van de eerdere overdracht van vandaag: #113, #132, #130, #128, #129, #153, #155, #151, #156, #115,
   #158 (Lanczos-test op de OBS-pc; dan `docs/obs-standaard.md` bijwerken).
3. Geen integratietests voor `checkStops` (#113, #131) en de timer `agentBewaking`.
4. **Nog niet gemerged naar main:** docs-commit `fbd2ebf` (#98) en de overdracht zelf.
5. Overige backlog zonder haast: #131-test op de zaal-pc, #145/#146/#147, #118–#120, #91, #95, pauzescherm-kaarten
   (#46–#51), onderzoek (#52/#53).

## Waar de kennis verder staat

- Issues **#131, #99, #161, #162, #98, #140** (omschrijving + sluitende comments met het bewijs).
- `docs/api-contract.md` — v0.68 (refresh) en v0.69 (dryRun) in de wijzigingslog.
- `docs/obs-standaard.md` — sectie "Bronnen per tafel".
- `backend/src/planning/podium.js` — uitgebreide incident-commentaren (05-09, 26-09).
- `CLAUDE.md` — sectie "Hoe een avond verloopt" → Vangnetten (bijgewerkt met #131).
