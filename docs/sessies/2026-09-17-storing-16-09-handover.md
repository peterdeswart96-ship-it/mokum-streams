# Handover — sessie 17 september 2026 (storing 16-09 onderzocht en opgelost)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Tweede sessie van 17-09; de eerste (poster-metadata) staat in `2026-09-17-handover.md`.

## De rode draad

Op de avond van 16-09 ging bijna alles mis wat mis kon gaan: streams die na 51 seconden of
5 minuten stopten, een stream die de hele avond op "Upcoming" bleef staan (tafel 3 zwart),
en handmatige streams op tafel 15/16 die na precies een uur werden afgekapt, midden in een
teamwedstrijd. De ochtend erna bleek ook nog de OBS-pc om 02:16 uitgevallen.

Peter vroeg om eerst grondig in kaart te brengen wat er misging. Dat is gedaan uit Application
Insights, de Cuescore-API en de code. Het bleken **één hoofdoorzaak met drie gevolgen**, plus
**drie losstaande problemen**. De hoofdoorzaak en de gevolgen zijn opgelost en staan live.

## Hoe de storing van 16-09 in elkaar zat

**Hoofdoorzaak (#127).** Cuescore had de MEGA Winter Ranking-serie opnieuw aangemaakt onder
nieuwe ID's (oude reeks `88433575`–`88433587` is dood; #4 heet nu `88435585`). De planner hield
het oude record met `planned: true` náást het nieuwe. De wees-migratie uit #122 ving dit niet,
omdat beide ID's een tijd tegelijk bij Cuescore stonden.

**Gevolg 1 — create/stop-lus (#128).** Record A maakte om 19:05 een broadcast; record B vond die
"van een ander toernooi" en `vrijTeMaken()` sloot 'm om 19:06; `tafelVrijVoor()` noemde de tafel
weer vrij; createBroadcasts maakte een nieuwe. Tafel 1 kreeg vier broadcasts in een kwartier.

**Gevolg 2 — verkeerde herkoppeling (#129).** Het zelfherstel in checkStops koppelde tafel 1 aan
"Mokum 14.1 Summer league". De titel-vangrail van #103 eiste één gedeeld woord — en dat was
"Mokum", dat in vrijwel elke toernooinaam staat. Een competitie heeft een andere stopregel, dus
de stream stopte meteen.

**Gevolg 3 — tafel 3 zwart (#131, nog open).** Broadcast `ET0Axv8OIkI` kreeg nooit data.
Vermoeden (niet bewezen): gebonden aan een stream key die al actief was, waardoor YouTube's
autoStart nooit een inactief→actief-overgang zag. Het herstart-vangnet (#114) sloeg niet aan
omdat de agent `streaming: true` meldde.

**Los probleem — 1-uursstop (#130).** Handmatig gestarte streams hebben geen Cuescore-koppeling,
dus `venueTables` ziet de tafel nooit als `playing`, dus de inactiviteitsregel (#100) kapte ze
na een uur af. Zelfde patroon als #121.

## Wat er is gedaan (allemaal live sinds 17-09 10:51, commit `d4b8e67`)

| Issue | Fix | Waar |
|---|---|---|
| #134 (sluit #130) | 1-uurs- en challenge-stop **uit**, achter app-settings `INACTIVITEIT_STOP` / `CHALLENGE_LIMIET` (standaard uit) | `config/automation.js`, `functions/checkStops.js` |
| #127 | Dubbelganger met levende naamgenoot direct weg; echt verdwenen toernooi pas na 3 uur ontwapend (`cuescoreWegSinds` / `cuescoreWeg`); createBroadcasts slaat een ID over dat Cuescore als ongeldig meldt (`toernooiOnbekend`); badge in de planner | `planning/planning.js`, `cuescore/index.js`, `functions/createBroadcasts.js`, `App.jsx` |
| #128 | Vrijmaken laat alles met rust dat ná het openen van het venster is aangemaakt (`aangemaaktOp`); noodrem van max 4 broadcasts per tafel per dag + alarm (`MAX_BROADCASTS_PER_TAFEL`) | `planning/vrijmaken.js`, `functions/createBroadcasts.js`, `notify/alertBericht.js` |
| #129 | `mokum` in `NEGEER_WOORDEN`; herkoppelen alleen binnen hetzelfde record-type | `planning/koppel.js`, `functions/checkStops.js` |

API-contract v0.56 en v0.57. App-settings gedocumenteerd in `docs/azure-setup.md`.
Tests: 424 (was 407). Geen bestaande test aangepast.

**Bewezen in productie:** #127 — na de import van 11:00 ging de planning van 84 naar 81 records
en staat Winter Ranking #5 nog één keer in `/api/schedule`. Gesloten.

## Besluiten van Peter

- **Automatische stop op tijd/inactiviteit helemaal uit** (1 uur én 3 uur). Vangnet = nachtstop
  02:00 + eigen eindtijd. Staat ook in `CLAUDE.md`.
- **Toestemming om alle wijzigingen uit deze sessie naar main te zetten** — gegeven en uitgevoerd
  (release-PR #139). Dit gold voor déze sessie, niet als staande afspraak.
- **Competitie-wizard (#120)** volledig ontworpen, zie hieronder.

## Valkuilen die tijd hebben gekost

- **`develop` deployt nergens.** "Deploy naar test (develop branch)" draait alleen tests. Alleen
  `main` gaat naar Azure. Ik heb twee keer ten onrechte "op test" gezegd. Controleer live code
  altijd met `/api/health` (geeft de commit).
- **PR's krijgen geen CI** (alleen `push` naar develop). Een lint-waarschuwing (`--max-warnings 0`)
  kwam daardoor pas ná de merge boven water (hersteld in #138). Draai `npm run lint` lokaal.
- **Application Insights-query's via `az` hebben standaard 1 uur venster** — altijd `--offset`
  meegeven, anders krijg je lege resultaten.
- **Archief-rebuild is lossy** (#140), zie hieronder.

## Nog open

**Direct actie nodig:**
- **Archief herstellen.** De rebuild van vandaag liet het archief krimpen van 1823 naar 1755
  wedstrijden: 85 wedstrijden van spelers die hun Cuescore-naam wijzigden (Mostafa 29, Luuk 20, …).
  Herstelbestand met 1840 regels: `C:\Users\Admin\Downloads\archief-herstel-2026-09-17.json`.
  Peter moet dit via de Portal uploaden naar `mokumstreams2945` → `mokum-streams` → `archief.json`.
  **Geen nieuwe rebuild draaien tot #140 is opgelost.**
- **OBS-pc (#133)** — sinds 02:16 offline. Níét de wekelijkse herstart (die is ma/do 06:00).
  Diagnosecommando's staan in het issue. Zonder pc geen stream.

**Wacht op bewijs uit de praktijk:**
- #130 — dicht na een handmatige stream die >1 uur blijft lopen (league-avond)
- #128, #129 — voorstel: dicht na één normale toernooiavond zonder regressie

**Nog niet aan begonnen:** #131 (Upcoming, vraagt test met OBS), #132 (alarm bij offline agent),
#140 (archief koppelen op `playerId` i.p.v. naam).

**Geopperd, nog geen issue:** CI laten draaien op pull requests (één `pull_request`-trigger).

## Competitie-wizard (#120) — volgend onderwerp

Peter wil hiermee verder in een nieuwe chat. Het ontwerp is compleet vastgelegd in #120
(flow in 7 stappen, databron `backend/src/mokumCompetitie/`, alle keuzes). Kern:
- Categorie → niveau → team (alleen met thuiswedstrijd) → wedstrijd (op `venueName`, niet
  `isHome`) → tafels (meerdere) → nu starten of inplannen (preroll 5 min)
- Titel `Tafel {nr} {niveau} {thuisteam} vs. {uitteam}`; alleen scorebord aan; public;
  stoppen alleen handmatig; tafel bezet → weigeren; `streamType: 'competitie'`
- 14.1 league hoort er níét bij

**Open vraag voor Peter:** de mokum-competitie-API geeft alleen aankomende wedstrijden en laat een
wedstrijd vallen zodra die begonnen is. "Vanaf vandaag" vraagt een aanpassing in het
**mokum-competitie-project** (andere repo). Mag daar een issue voor aangemaakt worden?

## Waar de kennis staat

- Issues #127–#134, #140 — redenering + logregels; #127 heeft het productiebewijs
- #122 — heeft nu een vervolgcomment die naar #127 verwijst
- `docs/api-contract.md` v0.56/v0.57
- `CLAUDE.md` — besluit over automatische stops
