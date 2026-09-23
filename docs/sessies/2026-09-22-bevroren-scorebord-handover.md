# Handover — sessie 22 september 2026 (bevroren scorebord bij de competitiestreams, #153)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Vorige overdracht: `2026-09-21-pauzemelding-opruimen-handover.md`.

## De rode draad

Aanleiding: bij de drie competitiewedstrijden van maandag 21-09 (tafels 1, 3, 15 en 16) bleef de
stand in beeld de hele avond op de beginstand staan. Ruim drie uur lang zagen kijkers 0–0 met
spelers die allang klaar waren.

**De diagnose is deze sessie twee keer bijgesteld.** Dat is de belangrijkste les van de dag, en de
reden dat deze overdracht uitvoerig is over het verloop en niet alleen over de uitkomst:

1. **Eerste conclusie (fout):** Cuescore koppelt bij een teamwedstrijd geen partijen aan tafels,
   dus het scorebord zou een losse, niet-bijgehouden partij tonen. → fix gebouwd die het scorebord
   bij competitie uitzette.
2. **Tweede conclusie (ook fout):** het werkt soms wél (17-09), dus het hangt af van of spelers
   hun partijen toevallig bijhouden. → fix teruggedraaid, vangnet gebouwd dat het scorebord
   verbergt zodra de stand stilstaat.
3. **Derde conclusie (de goede):** de teams hielden alles keurig bij. De data in Cuescore klopte;
   het **beeld** klopte niet. De OBS-browserbron was bevroren. → vangnet omgebouwd naar het
   verversen van die bron.

Wat de correctie afdwong was feedback van een captain via Peter, mét bewijs. Zonder die feedback
was er een fix in productie blijven staan die op een verkeerde aanname rustte.

## 1. Wat er werkelijk aan de hand was (#153)

De OBS-bron `Scoreboard` is de Cuescore-overlay met een vaste URL per tafel
(`cuescore.com/scoreboard/overlay/?tableId=…`). Die pagina haalt zelf zijn gegevens op. In haar
JavaScript zit deze regel:

```js
.fail(function(a){ Scoreboard.Overlay.pollerInterval = null })
```

Mislukt één aanvraag, dan wordt de herhaling op `null` gezet en **nooit meer gestart**. Eén
hapering en de pagina blijft staan waar hij stond — de rest van de avond. Het tweede kanaal van
die pagina, een websocket, herstelt zich wél (`onclose` → opnieuw verbinden na 5 s); de poll-lus
niet.

Dat verklaart alles wat eerst niet paste:

- **waarom meerdere tafels tegelijk bevroren** — één netwerkhapering op de streaming-pc raakt alle
  browserbronnen tegelijk;
- **waarom het de ene avond wel en de andere niet gebeurt** — het hangt van een hapering af;
- **waarom de data wél klopte.**

### Het bewijs dat de teams het goed deden

Challenge `89921515`, opgehaald via `api.cuescore.com/challenge/?id=…`:

```
table.tableId : 61403800  → tafel 15, de juiste cameratafel
matchstatus   : finished
score         : Joris de Winkel 1 - 8 Moudar Ali
```

Netjes op de juiste tafel, bijgewerkt, afgesloten. Beide spelers zitten gewoon in de twee teams
die die avond speelden (Mokumse zwendelaars / Rackless in Mokum via de teampagina's op Cuescore).

### Waar de redenering misging

Uit "die spelersnamen staan niet in het teamtoernooi" werd geconcludeerd dat het geen echte partij
van die avond kon zijn. Maar **individuele competitiepartijen staan niet ín het teamtoernooi** —
ze hangen als losse partij (challenge) aan de tafel. De teamwedstrijd zelf heeft inderdaad
`table: []` en `frames: []`, maar dat zegt niets over de partijen. Eén challenge opvragen had het
meteen laten zien.

**Les voor een volgende keer:** bij "het beeld klopt niet" eerst vaststellen of de *data* klopt,
vóór er een verklaring omheen wordt gebouwd. De bron die de kijker ziet
(`POST cuescore.com/ajax/scoreboard/overlay-v2.php` met `tableId`) en de bron die de waarheid
bevat (`api.cuescore.com/challenge/?id=…`) zijn allebei in één commando te bevragen.

## 2. De fix die er nu ligt

`backend/src/functions/scorebordWacht.js` + `backend/src/planning/scorebordWacht.js` (nieuw):

- Timer, elke minuut op seconde 50 (naast checkStops/liveMatches op 0, liveVideos op 20,
  pauzeScherm op 40).
- Haalt per **streamende** tafel op wat de overlay zelf ophaalt, en maakt daar een vingerafdruk
  van (wedstrijd-id + beide spelers + beide scores). Bewust niet de hele respons: een tijdstempel
  daarin zou elke ronde veranderen.
- Is de vingerafdruk veranderd, dan een **`refreshSource`** voor de bron `Scoreboard` — hooguit
  eens per `SCOREBORD_REFRESH_MIN` minuten (standaard 10). Verandert er niets, dan geen refresh:
  een bevroren bron doet op dat moment geen kwaad, want er is toch niets nieuws te tonen.
- Geldt voor **alle** streams, niet alleen competitie: elke browserbron kan bevriezen.
- Fail-safe: Cuescore onbereikbaar of antwoord onleesbaar → niets doen.

App-settings: `SCOREBORD_WACHT` (standaard aan, `false` zet de timer uit) en
`SCOREBORD_REFRESH_MIN` (standaard 10). Beide zonder deploy bij te stellen.

**Kosten:** verwaarloosbaar. De timer draait toch al elke minuut — dat bepaalt de Flex
Consumption-rekening, niet of hij een commando wegschrijft. De werkelijke prijs is zichtbaar: de
bron is bij een refresh ongeveer een seconde uit beeld. Vandaar de rem van 10 minuten.

## 3. Pauzescherm slaat competitiestreams over (#155)

Onderweg gevonden, en dit was 21-09 **net niet** misgegaan. `pauzeScherm` bepaalt per tafel of er
gespeeld wordt met `tafelSpeeltNu(tournaments, tafel)` — die zoekt een lopende wedstrijd op die
tafel in de toernooidata. Bij een teamwedstrijd bestaat die koppeling niet, dus het antwoord is
altijd "er speelt niets" terwijl er gewoon gespeeld wordt.

In productie staat `PAUZESCHERM_KEYS=jumbotron` en `PAUZESCHERM_UIT=scoreboard`. Was de toestand
ooit omgeslagen, dan was de **jumbotron over de lopende competitiewedstrijd** gekomen.

Dat gebeurde niet door toeval: een tafel zonder eerdere toestand begint neutraal in `pauze`
(`volgendeToestand`), en zolang de toestand niet *verandert* stuurt de timer geen commando's. De
tafels bleven de hele avond in die begintoestand.

**Fix:** nieuwe pure helper `competitieTafels(store)` in `backend/src/planning/pauze.js`;
`pauzeScherm` leest de broadcast-store van de zaal-dag en slaat die tafels over, met een
warning-regel per overgeslagen tafel.

## 4. Wat er is gewijzigd

Alles gemerged naar `main` en uitgerold. Op `develop` staat alleen nog deze overdracht.

| Commit | Wat |
|---|---|
| `3bcd3df` → `ab0bdd5` | Eerste fix (scorebord uit bij competitie) en de **revert** daarvan |
| `9f86985` | Handleiding voor teamcaptains (**achterhaald**, zie hieronder) |
| `bccf1e4` / `b4c2c33` | #155 — pauzescherm slaat competitiestreams over |
| `63e7100` / `edcf5b4` | Vangnet "verbergen bij stilstand" (**vervangen**) |
| `042f3ac` / `3f4b642` | De goede fix: scorebord **verversen** i.p.v. verbergen |

Tests: backend **483 pass**, 0 fail. Lint schoon. `docs/api-contract.md` op **v0.67** (v0.65 =
#155, v0.66 = het vangnet, v0.67 = de correctie daarop).

## 5. Besluiten van Peter deze sessie

- **Scorebord aan laten en een vangnet bouwen** in plaats van het scorebord bij competitie uit te
  zetten — genomen toen de tweede diagnose nog gold, en nog steeds de juiste richting.
- **Mergen naar `main`**: meermaals expliciet akkoord, telkens uitgevoerd en gedeployed.
- **Refresh alleen tijdens streams** (en niet blind elke 10 minuten, maar alleen als er iets te
  tonen is).
- **Alleen de tekst voor Nick herschrijven**; de captain-handleiding niet.

## 6. Wat er nog open staat

- **#153 blijft open.** De fix draait, maar het bewijs moet uit de zaal komen: op de eerstvolgende
  competitieavond hoort er in de log te staan
  `[scorebordWacht] tafel N: scorebord ververst — nieuwe stand "..."`. Staat er in plaats daarvan
  `stand niet herkend in het Cuescore-antwoord`, dan kloppen de veldnamen in `vingerafdruk()` niet
  — de logregel noemt dan de werkelijke velden en het is één regel werk. **De veldnamen bij een
  lopende wedstrijd zijn nooit geverifieerd**: op een stille dag antwoordt Cuescore alleen
  `{"status":"WAITING"}`.
- **#155 blijft open** tot de log-regel `overgeslagen: competitiestream (#155)` op een echte avond
  verschijnt.
- **De captain-handleiding is achterhaald.** Staat als pagina op
  https://claude.ai/artifact/75thrv64s4toTzL3wSgBCc (privé, nooit gedeeld) en als bron in
  `docs/handleiding-captains.md`. Hij vraagt de teams iets te doen wat ze al deden. **Niet
  verspreiden**; intrekken of herschrijven is nog een besluit van Peter.
- **#154** (eigen scorebalk) — aanleiding vervallen, voorstel tot sluiten staat als comment in het
  issue.
- **#156** (ochtendrapport) — moet worden bijgesteld: meet niet de stand maar of het vangnet zijn
  werk deed. Staat als comment in het issue.
- **#157** (nieuwe Cuescore-overlay) — nu extra relevant: als `cs-stream-overlay` wél opnieuw
  verbindt na een mislukte aanvraag, kan de refresh uit #153 omlaag of weg.
- **#158** (nieuw) — beeld van tafel 16 is onscherper dan de andere. Peter bevestigde dat 15/16
  geen eigen OBS-instantie delen en dat hem geen afwijkende camera-instelling bekend is; de
  waarschijnlijkste verklaring blijft dat die ene camera afwijkt van de andere drie.
- **#152** (dode rotatie-tak in de agent) — ongewijzigd, wacht op een besluit.
- Uit eerdere overdrachten ongewijzigd: #145, #146, #140, #131, #132, #133, #147, #151.

## 7. Valkuil bij het deployen (nieuw, en dit komt terug)

De deploy van `3f4b642` faalde op de stap "Verifieer dat de nieuwe code draait": `/api/health`
bleef de vórige commit melden terwijl de publish-stap groen was. De oorzaak stond in de blob
`kudu-state.json` in de deployment-container
(`app-package-mokumstreamsfunc-7208082`, storage-account `mokumstreams2945`, lezen met
`--auth-mode key`):

> "Deployment was successful but Reset all workers endpoint responded with Resource temporarily
> unavailable. Please restart the app and run sync trigger manually"

Wat **niet** hielp: `az functionapp restart` (twee keer) en `syncfunctiontriggers` via `az rest`.
Wat **wel** hielp: `gh run rerun <id> --failed` — de workflow opnieuw draaien.

Die verificatiestap in `deploy-prod.yml` is goud waard: zonder die stap had de deploy als geslaagd
gegolden terwijl productie oude code draaide.

## 8. Waar de kennis verder staat

- **#153** — het volledige verloop, inclusief beide correcties, met het bewijs uit Cuescore
- `docs/api-contract.md` **v0.67** (en v0.65, v0.66 voor de tussenstappen)
- `backend/src/planning/scorebordWacht.js` — de pure logica, met in de kop waaróm dit bestaat
- `backend/src/functions/scorebordWacht.js` — de timer
- `backend/src/planning/pauze.js` (`competitieTafels`) + `backend/src/functions/pauzeScherm.js`
- Tests: `backend/test/scorebordWacht.test.js`, `backend/test/pauze.test.js`
