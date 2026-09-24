# Overdracht 24-09 — negen issues doorgelopen, ochtendrapport uitgebreid, OBS-pc vanaf de kassa te wekken en herstarten

Aanleiding: Peter vroeg welke issues Claude zelfstandig kon oplossen en liet er een aantal
oppakken (#152, #159, #97, #156, #116, #98). Halverwege meldde Peter dat de ochtend-uitval van de
OBS-pc door een stroomprobleem in de meterkast kwam (nu verholpen), en wilde de pc ook vanaf
thuis/de kassa kunnen aanzetten en herstarten (#60). Alles staat op **develop**; er is niets naar
main gegaan (Peters besluit).

## Rode draad

De issuelijst bleek niet helemaal de werkelijkheid: sommige issues waren al opgelost maar
zonder afsluiting (#97), andere hadden hun code al in productie en wachtten alleen op
verificatie (#151, #128, #129). Eerst de code en de productie-API lezen bespaarde werk. Daarna
kwam er een tweede lijn bij: het ochtendrapport kreeg drie nieuwe signalen, en de OBS-pc kreeg
twee knoppen (wekken, herstarten) op de kassa-pc, bedoeld voor personeel bij grote problemen.

## 1. Opgelost of opgeruimd

- **#97** (doorlopende competities uit "Komende toernooien") — was al opgelost in `91882b5` en
  in main. Verificatie tegen de echte `/api/sheets` op 24-09: geen 14.1 league meer, vijf echte
  toernooien. **Gesloten** met dat bewijs.
- **#152** (dode rotatie-tak in de agent) — `9226378`. `rotatieZichtbaar()`, de `rotations`-lus en
  vier tests weg; ook de dode `config.overlaySources`-override (zelfde ketting als #151). Nieuw:
  `loadConfig()` logt `[CONFIG] onbekend veld '…'` als `agent-config.json` iets bevat dat de agent
  negeert (`agent/src/config.js`, `onbekendeVelden()`). Besluit Peter: opruimen (optie A) én de
  logregel. Agent-tests 66 pass.
- **#159** (Stop-knop zonder "bezig"-feedback) — `08f5f30`, `frontend/src/App.jsx`. De knop blijft per
  tafel vergrendeld ("Bezig met stoppen…") tot de tafel niet meer live is; het dashboard ververst
  dan elke 2 s in plaats van 5 s; na 60 s nog live volgt een foutmelding en komt de knop vrij.
  Alleen op build getest (de frontend heeft geen tests) — **nog even in de browser bekijken**.

## 2. Ochtendrapport uitgebreid

Alles in `backend/src/rapport/duiding.js` (+ `mail.js`), tests in `backend/test/rapport.test.js`.

- **#156** — `ec581af`. Een uitzending van ≥ 60 min zonder één scorebord-verversing
  (`[scorebordWacht] … scorebord ververst`) komt als *let-op* in het rapport (geen alarm, telt niet
  mee in de onderwerpregel). Losse uitzendingen zonder toernooi tellen niet mee. De melding noemt
  ook hoe vaak Cuescore onbereikbaar was; bij de cijfers staat "scorebord ververst: Nx". Bijstelling
  van Peter (22-09) zat al in het issue: het rapport meet niet de stand maar of het vangnet (#153)
  werkte. Getoetst op de echte avonden van 22-09 (39 verversingen) en 23-09 (41): geen melding.
  **Let op:** voor datums vóór 22-09 bestond de timer nog niet, dus een rapport van een oudere avond
  geeft valse scorebordmeldingen.
- **#116 deel 1** — `aad4725`. De herstelpogingen van #114 (`opnieuw starten (poging N/3)`) en het
  `[ALARM] … niet live na N pogingen` stonden wel in de logs maar niet in het rapport: er kon
  "Niets bijzonders" staan op een avond dat er een alarm naar mail en ntfy ging. Nu komt een herstelpoging
  als *let-op* en een alarm als aandachtspunt (telt mee in de onderwerpregel).
- **#116 deel 2, stap 1 (alleen loggen)** — `c877704`. `functions/agentApi.js` logt bij een omslag van
  `streaming` per tafel: `[agent] tafel N: OBS meldt: zendt (X kbps)` / `gestopt`. Pure logica in
  `backend/src/agent/statusOmslag.js` (geen omslag zonder OBS-verbinding of zonder vorige status; een
  fout bij het loggen laat de statuspost niet mislukken). Het rapport negeert deze regels bewust nog
  (een test legt dat vast). Kosten: één extra blob-read per agentpost.
  Backend-tests 502 pass, lint schoon.

**Wat #116 niet oplost:** de avonden van 24-08 en 25-08 (waar het issue over ging) geven nog steeds
"Niets bijzonders". Er was toen geen herstelpoging en nergens een bevestiging dat OBS iets deed.

## 3. OBS-bronnen uitlezen (#98) — script klaar, uitvoer nog niet verwerkt

`agent/scripts/obs-bronnen-uitlezen.js` (`0403c63`, verbeterd in `213e3e2`) leest per tafel alleen-lezen
de bronnen uit OBS en maakt een markdown-tabel + een sectie "Verschillen tussen de tafels". Logica in
`agent/src/obsBronnen.js` (75 agent-tests pass). Camerabronnen tonen alleen het type en gevoelige
URL-delen worden gemaskeerd (RTSP-URL's kunnen inloggegevens bevatten — werkafspraak 4).

Eerste run op de OBS-pc (24-09) las alle vier de tafels goed uit. Nepverschillen (cameranamen met tafelnummer,
Cuescore-`tableId` per tafel, lege kolommen doordat OBS alleen afwijkingen van de standaard levert,
`slideshow_v2` onbekend) zijn daarna in het script verholpen. **De verbeterde versie is nog niet
opnieuw gedraaid.** Echte bevindingen uit die eerste run:
- **Competitiestand op tafel 16 staat niet op slot** (op de andere tafels wel).
- **Scoreboard heeft op tafel 3 en 16 eigen css, op tafel 1 en 15 niet** — welke bedoeld is, weten we
  nog niet; de nieuwe versie toont de css-tekst.
- Op tafel 15 heet de scène `Scene` (de rest `Scène`); onschuldig, de agent gebruikt de actieve scène.
- De Cuescore-tableId's in de Scoreboard-URL's kloppen alle vier met `TAFELS` in `backend/src/challenge/cuescore.js`.

## 4. OBS-pc vanaf de kassa wekken en herstarten (#60)

**Context:** de ochtend-uitval van de OBS-pc (#133) bleek door de meterkast te komen (verholpen volgens
Peter, 24-09). Dat past bij Event 41 met BugcheckCode 0, geen minidump en geen WHEA/GPU-fouten. Niet bewezen dat
alle uitvallen daaraan lagen.

**Belangrijke correctie op het plan in #60:** er is **geen UniFi Network/gateway** (alleen een UNVR voor Protect,
"Network (0)" in Site Manager). De aanname "UniFi-console als verzender" klopte dus niet.

**BIOS gedaan (24-09)** op de Lenovo 90YJ001TMH: Wake on LAN aan, After Power Loss = Power On,
Enhanced Power Saving Mode uit. **Wake-on-LAN getest en werkt** (netjes afgesloten, magic packet vanaf een
andere pc op het LAN, pc startte).

**Scripts** (`scripts/kassa/`, handleiding `docs/kassa-knoppen.md`), gemaakt voor Windows PowerShell 5.1 en
daarom **alleen ASCII** (5.1 leest een bestand zonder BOM als ANSI):
- `Wek-OBS-pc.ps1` — kijkt via `/api/live` of de agent online is, vraagt bevestiging (standaard **Nee**),
  stuurt het magic packet via elke actieve netwerkkaart, wacht tot de agent terug is.
- `Herstart-OBS-pc.ps1 -Pc <naam>` — herstart rechtstreeks via Windows (`shutdown /r /f /m`), dus ook als OBS of
  de agent vastzit. Bevestiging, een tweede waarschuwing als er een stream live is, wacht tot de agent terug is.
  `-TestVerbinding` plant een herstart over 10 min en breekt die direct af (test de rechten); `-Proef` toont alleen tekst.

**Besluit Peter (24-09):** de OBS-pc bevat geen belangrijke data en heeft een apart lokaal beheerdersaccount, dus
een commando voor aanzetten en herstarten is voldoende en geen echt securityrisico. Bedoeld voor personeel bij
grote problemen, via een Stream Deck-toets met bevestiging. Rechtstreeks via Windows (niet via de agent) omdat de
agent bij "grote problemen" zelf kan hangen.

**Instelling (eenmalig, gedaan en getest):**
- OBS-pc: computernaam `Mokumpoolendart`, IP `10.253.253.34`, account `MokumStream` (lokale beheerder), MAC
  `C8-53-09-C5-60-1E`. `LocalAccountTokenFilterPolicy=1`, firewallgroepen "Windows Management Instrumentation (WMI)"
  en "Bestands- en printerdeling" aan, beperkt tot `LocalSubnet`.
- Kassa-pc: het wachtwoord van dat account staat in het **Windows-referentiebeheer** (`cmdkey`), nergens in script of repo.
  Wie op de kassa-pc met dat Windows-account is ingelogd, kan de OBS-pc dus herstarten (bewuste afweging).
- `-TestVerbinding` gaf **GELUKT**; wekken en herstarten zijn daarna via de snelkoppelingen en de Stream Deck getest
  en werken ("alles werkt", Peter).

**Beperking:** een echt **bevroren** pc (Windows reageert niet meer) herstart geen van beide. Daarvoor blijft over: een
slimme stekker (die met "After Power Loss = Power On" de pc weer laat opstarten) of iemand ter plekke.

**Let op:** in de chat stond in het gekopieerde `Wek-OBS-pc.ps1` per ongeluk `'Button2'` in het laatste venster (repo:
`'Button1'`). Onschadelijk (alleen de standaardknop van een OK-venster), maar de kopie op de kassa-pc kan afwijken.

## Wat er nog open staat

1. **Mergen naar main** (Peters besluit): pas dan gaan #156, #116 (deel 1 + logging), #152 en #159 live. **De agent op
   de OBS-pc volgt main zonder CI/CD** — na een merge daar handmatig `git pull origin main` en `MokumAgent` herstarten
   (zie het geheugen `reference_agent_uitrollen_obs_pc`). Nu staan daar tijdelijk twee losse bestanden uit develop
   (`agent\src\obsBronnen.js`, `agent\scripts\obs-bronnen-uitlezen.js`): **verwijderen vóór die pull**, anders weigert git.
2. **#98:** het verbeterde bronnenscript nog één keer draaien, de uitvoer (zonder geheimen) laten controleren, de tabel in
   `docs/obs-standaard.md` zetten, de kringverwijzing naar #39 weghalen en sluiten. Ook beslissen: de Competitiestand op
   tafel 16 op slot en de Scoreboard-css op tafel 3/16 vs 1/15.
3. **#116 deel 2, vervolg:** na uitrol naar main een paar avonden meekijken in Log Analytics
   (`AppTraces | where Message startswith '[agent] tafel'`, gedeelde werkruimte, filteren!), controleren of de omslagen
   kloppen en niet flapperen, en dan pas het rapport laten oordelen (start/stop onbevestigd = aandachtspunt; omslag zonder
   commando = handmatige ingreep). Risico: vals alarm als een start komt terwijl OBS al zendt (geen omslag).
4. **#60:** WoL en de kassa-knoppen zijn klaar. Open blijft een **slimme stekker als vangnet voor een bevroren pc** (idee:
   een stekker met cloud-API, zodat een dashboardknop hem kan schakelen; alleen aanbieden als de agent offline is, want
   stroom afsnijden bij een draaiende pc kan Windows beschadigen). Eerst uitzoeken welke stekker een bruikbare API heeft,
   pas daarna kopen. Voorstel: #60 sluiten en hiervoor een apart issue maken.
5. **#151, #128, #129:** code staat in productie; wachten op een zaalstart zonder `[DROP]`-regel (#151) resp. een normale
   toernooiavond (#128, #129).
6. **#134** (auto-stop uitzetten): in de code staat de standaard op uit (`INACTIVITEIT_STOP`/`CHALLENGE_LIMIET` moeten
   `true` zijn), CLAUDE.md zegt hetzelfde, maar er is geen afsluitende comment met productiebewijs. Waarschijnlijk
   opgelost, **nog te bevestigen** voor sluiten (werkafspraak 9).
7. **#159** nog in de browser bekijken; **#133** (uitval OBS-pc): met de meterkast-oorzaak kan dit mogelijk dicht, maar
   pas als het na de reparatie niet opnieuw gebeurt.

## Waar de kennis verder staat

- Issues: #152, #159, #97 (sluit-comment met bewijs), #156, #116 (twee stand-van-zaken-comments), #98, #60 (drie comments).
- `docs/kassa-knoppen.md` — installatie op de kassa-pc, eenmalige instellingen op de OBS-pc, testen.
- `docs/sessies/2026-09-23-vattenfall-thumbnails-en-live-melding-handover.md` — de vorige sessie (#159 kwam daar vandaan).
- Geheugen: `project_obs_pc_stroomprobleem_meterkast` (meterkastoorzaak van de uitvallen).
