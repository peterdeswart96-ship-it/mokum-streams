# Handover — sessie 21 september 2026 (dode overlay 'Pauzemelding' opgeruimd, #151)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Vorige overdracht: `2026-09-21-stream-vastgelopen-jackpot-handover.md` (zelfde dag, ander
> onderwerp).

## De rode draad

Eén onderwerp: #151, het opruimen van de overlay `pauzemelding`. Dat was op papier een
opruimklus, maar er zaten drie verrassingen in.

1. **De dashboardknop was er al niet meer.** Het issue beschreef als hoofdklacht "een knop die
   liegt", maar #75 had die knop al verwijderd. De `[DROP]` in `agent.log` kwam ergens anders
   vandaan (zie hieronder).
2. **De echte valkuil was de code-default**, precies zoals het issue als tweede punt noemde. Die
   is verholpen.
3. **De agent-override die we wilden natrekken bestaat helemaal niet** — en daarbij viel nóg een
   dode bronverwijzing op, van maanden terug.

Alles is gemerged naar `main`, de productie-deploy is groen. Het issue staat bewust nog **open**:
de zaaltest ontbreekt (werkafspraak 9).

## 1. Waar die `[DROP]` echt vandaan kwam

Bij elke streamstart stond er in `agent.log`:

```
[DROP] setOverlay tafel 1: bron 'Pauzemelding' niet gevonden in scène 'Scène'
```

Niet omdat iemand op een knop drukte, maar omdat `startCommandsFor`
(`backend/src/agent/commandQueue.js`) bij élke start een expliciete stand stuurt voor *iedere*
sleutel uit `OVERLAY_BRON` — ook voor sleutels zonder dashboardknop. Zolang `pauzemelding` in die
map stond, ging er dus bij elke start een `setOverlay` naar een OBS-bron die in geen van de vier
instanties meer bestaat.

**Gevolg voor de volgorde van uitrollen:** de `[DROP]` is verdwenen zodra de *backend* was
uitgerold. Daar was geen agent-update voor nodig. Dat is het omgekeerde van wat je zou verwachten
bij een logregel die de agent schrijft.

## 2. De code-default (de echte valkuil)

`pauzeSchermKeys()` in `backend/src/config/automation.js` gaf zonder app-setting
`['pauzemelding']` terug. In productie staat `PAUZESCHERM_KEYS=jumbotron`, dus het automatische
pauzescherm wérkte — maar wie die app-setting zou weghalen, viel stil terug op een bron die niet
bestaat, zonder zichtbare fout. De default is nu `['jumbotron']`: code en productie zeggen
hetzelfde.

De app-setting `PAUZESCHERM_KEYS=jumbotron` mag in Azure gewoon blijven staan; hij maakt geen
verschil meer.

## 3. De agent-override die niet bestaat

Vraag tijdens de sessie: staat er op de OBS-pc misschien een eigen `overlaySources`-override in
`agent-config.json`, waardoor de agent `Pauzemelding` tóch blijft uitlezen?

**Nee — en dat kan ook niet.** `normalizeConfig()` in `agent/src/config.js` bouwt het configobject
veld voor veld opnieuw op en geeft alleen `backendUrl`, `agentToken`, `pollIntervalMs`, `tables`
en `cameraWatchdog` terug. De velden `overlaySources` én `rotations` vallen daar weg. Omdat
`agent/index.js` via `loadConfig()` gaat, is `config.overlaySources` bij de draaiende agent altijd
`undefined` en wint `DEFAULT_OVERLAY_SOURCES` in `agent/src/agent.js` altijd. Geen controle op de
streaming-pc nodig.

De comment boven die map beloofde die override wél ("Per install te overrijden via
`config.overlaySources`") — dat is gecorrigeerd, met de reden erbij.

**Bijvangst:** in diezelfde map stond nog `cuescoreLogo: 'Cuescore logo'`, terwijl die OBS-bron
per api-contract v0.18 (13-07) al is verwijderd. Dezelfde soort dode verwijzing als #151, alleen
stiller: `overlayStates` in `agent/src/obs.js` slikt een ontbrekende bron zonder te loggen
(`catch {}`), dus het kostte alleen elke statusronde twee nutteloze OBS-calls per tafel. Weg.

## Wat er is gewijzigd

Commits: `6a0f33d` (opruiming), `13c6fc3` (agent-bijvangst), gemerged als `3e072e5`.
Productie-deploy groen (frontend + backend).

| Bestand | Wijziging |
|---|---|
| `backend/src/agent/commandQueue.js` | `pauzemelding` uit `OVERLAY_BRON` + `OVERLAY_DEFAULT_OFF` |
| `backend/src/config/automation.js` | `pauzeSchermKeys()` default → `['jumbotron']` |
| `backend/src/functions/streams.js` | body-doc van het overlay-endpoint (stond ook nog `cuescoreLogo` in) |
| `backend/src/functions/pauzeScherm.js` | comment |
| `agent/src/agent.js` | `pauzemelding` + `cuescoreLogo` uit `DEFAULT_OVERLAY_SOURCES`; comment gecorrigeerd |
| `frontend/src/App.jsx` | comment bijgewerkt (knop was al weg sinds #75) |
| `docs/api-contract.md` | **v0.64** — eerst bijgewerkt (werkafspraak 3) |
| `docs/obs-standaard.md` | bronvolgorde klopte niet meer; update-blok 21-09 toegevoegd |
| `docs/avond-runbook.md` | "voeg bron `Pauzemelding` toe" doorgehaald als vervallen |
| `docs/obs-herstel-runbook.md` | bronnentabel: `Pauzemelding` → `Competitiestand` |
| `docs/pauzescherm-auto.md` | waarschuwing bovenaan + de `PAUZESCHERM_KEYS`-default |
| `docs/handleiding-nick.md` | knoppenlijst voor Nick klopte niet meer |
| 3 testbestanden | `automation.test.js`, `commandQueue.test.js`, `pauze.test.js` |

Tests: backend **470 pass**, agent **50 pass**, 0 fail. Backend-eslint schoon, frontend-build
groen (de frontend heeft geen `lint`-script).

## Besluiten van Peter deze sessie

- **Mergen naar `main`**: expliciet akkoord gegeven, uitgevoerd en gedeployed.
- Het issue **niet sluiten** vóór de zaaltest — conform werkafspraak 9.

## Wat er nog open staat

- **#151 blijft open.** Twee van de drie punten uit "klaar wanneer" zijn af (dashboard,
  tests/lint). De derde moet nog: één start in de zaal waarbij `agent.log` geen
  `[DROP] … 'Pauzemelding'` meer toont en het pauzescherm nog gewoon schakelt. Zet het bewijs in
  de afsluitende comment en sluit 'm dan.
- ~~De agent op de OBS-pc is nog niet bijgewerkt.~~ **Gedaan op 21-09 ~11:09.** De pc stond op
  `b728156` en is doorgetrokken naar `3e072e5` — daarmee kwamen ook de jackpot-thumbnail-commits
  van eerder die dag mee, die daar nog niet stonden. Taak `MokumAgent` herstart; `/api/live` geeft
  `agent.online: true` (laatst gezien 20 s eerder), dus de agent draait op de nieuwe code.
- **#152 — de rotatie-tak in de agent is dood.** Zelfde oorzaak als de overlaySources-override:
  `config.rotations` haalt `normalizeConfig()` niet, dus `rotations.length` is altijd 0 en de
  `[ROTATIE]`-tak in `agent/src/agent.js` (rond regel 172) draait nooit. Twee tests dekken die tak
  af en slagen, omdat ze het configobject rechtstreeks aan `runOnce` geven en `normalizeConfig`
  overslaan — een groene test voor een pad dat in productie niet bestaat. De enige beoogde
  gebruiker (`Scores other tables`) is bovendien per v0.18 al uit OBS verwijderd. Keuze tussen
  opruimen (voorstel) en repareren staat in het issue; Peter beslist.
- In OBS hoeft niets te gebeuren: de bron `Pauzemelding` moet **niet** opnieuw worden aangemaakt.
- Uit eerdere overdrachten ongewijzigd: #145, #146, #140, #131, #132, #133, #147.

## Waar de kennis staat

- **#151** — het issue zelf, met de statuscomment van 21-09
- `docs/api-contract.md` **v0.64** — het volledige verhaal incl. hoe je de overlay ooit zou
  terugzetten, en de twee agent-bevindingen
- `backend/src/agent/commandQueue.js` (`OVERLAY_BRON`), `backend/src/config/automation.js`
  (`pauzeSchermKeys`), `agent/src/agent.js` (`DEFAULT_OVERLAY_SOURCES`), `agent/src/config.js`
  (`normalizeConfig` — de reden dat overrides niet werken)
- `docs/obs-standaard.md` — de actuele bronvolgorde per instantie
