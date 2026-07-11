# OBS-standaardisatie — Mokum Streams

Richtlijn om de **4 portable OBS-instanties identiek** in te richten. Dat maakt de
agent-aansturing uniform (dezelfde bronnamen op elke tafel), minder foutgevoelig
en makkelijker te onderhouden. Doen **vóór** de eerste test/uitrol, in overleg
met Nick.

> **Status (2026-07-09): OBS-inrichting AFGEROND op alle 4 instanties.** ✅
> Elke instantie identiek: `Scoreboard`, `Scores other tables`, `Cuescore logo`,
> `Sponsor slideshow` (alle sponsors roterend uit één map; statische logo's + groep
> verwijderd), `Camera Tafel N`. Uniform: namen, kleuren, posities/transforms,
> profiel/scene = `Tafel N`, Scoreboard-URL per tafel. Batch-launcher
> (`start-alle-obs.bat`) werkt. Tafel 16 kreeg het ontbrekende `Scoreboard`.
> **Nog te doen:** backup (Scene Collection → Export), **obs-websocket aanzetten**
> (poort 4455/4456/4457/4458 + wachtwoord per instantie) → dan Fase 1-test.

## Waarom standaardiseren
- **Eén set bronnamen** → de agent gebruikt overal dezelfde namen; onze
  standaard-overlaynamen (`Sponsors`, `cs score`) kloppen dan op elke tafel en er
  is geen per-tafel uitzondering meer nodig.
- Voorspelbare automatisering, minder "werkt op tafel X maar niet op Y".
- Nu wijken de namen per instantie af (screenshot: `gO`, `sPON`, `bUFFAL`,
  `KaMUI`) — dat willen we gelijktrekken.

## Standaard-bronnamen (identiek op elke instantie)
Nu lopen de namen uiteen (`gO`/`Go`, `sPON`/`Sponsors`, `bUFFALO`/`Buffalo`,
`KaMUI`/`Kamui`). Voorstel voor één duidelijke set — **exact gelijk** (incl.
hoofdletters) op alle vier de instanties:

Namen in het **Engels** (afgesproken 2026-07-09); het **tafel-token blijft
`Tafel N`** zoals in de YouTube-titel.

| Doel | Standaardnaam | Wat het is |
|---|---|---|
| eigen scorebord (`score`) | `Scoreboard` | scorebord van **deze** tafel (onder); toont "Next match will start shortly" als er geen wedstrijd loopt |
| andere tafels (`cs score`) | `Scores other tables` | roterende scores van **andere** tafels uit het toernooi (rechtsboven); leeg zonder toernooi |
| Cuescore-logo (`Modern`) | `Cuescore logo` | het Cuescore-logo (zeshoek op de tafel) |
| sponsoring | `Sponsor slideshow` | **ALLE sponsors roterend** in één plek (Image Slide Show). Statische hoeklogo's (`Buffalo`/`Kamui`/`GO Customs`) **vervallen** — rustiger beeld (besluit 09-07). Dashboard-schakelaar heet "Sponsors". |
| camera (`Tafel N`) | `Camera Tafel N` | de tafelcamera (achtergrond) |

> **Sponsor-opzet vereenvoudigd (besluit 09-07):** alle sponsors in één
> `Sponsor slideshow`, statische hoeklogo's + de `Sponsors`-groep vervallen.
> Per instantie:
> - Voeg **alle** sponsorafbeeldingen toe aan `Sponsor slideshow` (Properties →
>   afbeeldingenlijst) — dezelfde set op alle 4. Noteer eerst de bestandspaden van
>   de logo's `Sponsor - Buffalo/Kamui/GO Customs` (hun Properties) om te hergebruiken.
> - **Verwijder** de statische `Sponsor - Buffalo`, `- Kamui`, `- GO Customs`.
> - **Ontgroep** `Sponsors` (rechtsklik groep → *Ungroup*) — er blijft dan alleen
>   `Sponsor slideshow` over.
> - **Afbeeldingen:** gebruik **transparante PNG-logo's** (geen screenshots met
>   zwarte achtergrond) en zet ze in **één vaste map** (bv.
>   `C:\Users\poole\Mokum-Sponsors\`), niet verspreid over OneDrive/Downloads
>   (sync-risico, gaps #9). Verwijs alle 4 de slideshows naar diezelfde bestanden.
> Elke instantie moet uiteindelijk **dezelfde set + dezelfde namen** hebben.

> **UPDATE 2026-07-11 — overgestapt op de OFFICIËLE Cuescore-overlay.** Op alle 4
> tafels vervangt een nieuwe browser-source **`Scoreboard Cuescore`** het oude
> pixelgrid-`Scoreboard`. URL: `https://cuescore.com/scoreboard/overlay/?tableId=<ID>&lang=nl`
> (tafel 1=61403749, 3=61403764, 15=61403800, 16=61403803), 1920×1080, Fit to screen.
> Voordelen: spelersfoto's + vlaggen + innings/averages, Nederlands, huisstijlkleur,
> header + scorebord in één bron, en **tussen wedstrijden automatisch andere resultaten
> + next match**. Uitgezet op alle 4: oude `Scoreboard` (pixelgrid), `Scores other tables`
> en `Cuescore logo`. Zie `docs/cuescore-overlays.md` (incl. Jumbotron voor "andere tafels").
>
> ⚠️ **Aandacht vóór de agent live gaat:** de actieve bron heet nu `Scoreboard Cuescore`,
> maar de automatisering (`OVERLAY_BRON.scoreboard`) verwacht de naam **`Scoreboard`**.
> Vóór het scherp zetten: **hernoem `Scoreboard Cuescore` → `Scoreboard`** (en verwijder de
> oude pixelgrid-`Scoreboard`), óf pas `OVERLAY_BRON.scoreboard` aan naar `Scoreboard Cuescore`.
> Anders toggelt de dashboard-schakelaar "Scorebord" de verkeerde (uitgezette) bron.

### Scoreboard-bron (browser-source) — URL per tafel
De `Scoreboard` is een **Browser-source** naar het Cuescore-overlay-tool, met de
**Cuescore tableId** in de URL. Instellingen: **1280×720**, Custom CSS
`body { background-color: rgba(0,0,0,0); margin: 0px auto; overflow: hidden; }`.

| Tafel | Cuescore tableId | Scoreboard-URL |
|---|---|---|
| 1 | 61403749 | `https://pixelgrid.github.io/miscuescore/?t=61403749` |
| 3 | 61403764 | `https://pixelgrid.github.io/miscuescore/?t=61403764` |
| 15 | 61403800 | `https://pixelgrid.github.io/miscuescore/?t=61403800` |
| 16 | 61403803 | `https://pixelgrid.github.io/miscuescore/?t=61403803` |

- **Tafel 16 toevoegen:** `+` → *Browser* → naam `Scoreboard` → URL
  `…?t=61403803`, 1280×720, plak de Custom CSS.
- **Check de andere instanties:** elke `Scoreboard` moet naar **zijn eigen**
  tafel-id wijzen (niet die van een andere tafel).
- De `Scores other tables` (voorheen `cs score`) gebruikt vermoedelijk een
  andere URL (org-/toernooibreed) — stuur die Properties ook even door zodat we
  'm kennen.

**Overig gelijk:** obs-websocket aan (eigen poort 4455/4456/4457/4458 + wachtwoord),
stream key = de herbruikbare liveStream van díe tafel, zelfde output (zie
kwaliteit-standaard hieronder).

### Kwaliteit-standaard (bewezen op Tafel 15 + 16, 2026-07-11)
Aanleiding: Nick merkte dat KNBB-streams scherper waren. Oorzaak was tweeledig:
uiteenlopende OBS-output per tafel én YouTube-**latentie** die op laag/ultralaag stond
(dat begrenst YouTube op ~480p). Onderstaande config gaf een scherp 1080p60-beeld.

**OBS → Settings → Output** (Output Mode = **Advanced**), tab **Streaming**:
| Instelling | Waarde |
|---|---|
| Video Encoder | **NVIDIA NVENC H.264** |
| Rate Control | **CBR** |
| Bitrate | **9000 Kbps** |
| Keyframe Interval | **2 s** |
| Preset | **P6** (of "Quality") |
| Tuning | **High Quality** |
| Multipass Mode | **Two Passes (Quarter Res)** |
| Profile | **high** |
| Look-ahead / Psycho Visual Tuning | **aan** |

**OBS → Settings → Video:**
| Instelling | Waarde |
|---|---|
| Base (Canvas) Resolution | **1920×1080** |
| Output (Scaled) Resolution | **1920×1080** |
| Downscale Filter | **Lanczos** |
| Common FPS Values | **60** |

**YouTube (per stream):** **Streamlatentie = Normaal** — *niet* Laag/Ultralaag (die
begrenzen op ~480p). Dit was dé sleutelbevinding. Vergrendeld zolang een broadcast
loopt; staat op de herbruikbare keys al goed.

> **Bekend restpunt:** audio ontbreekt nog op de streams (YouTube meldt "audio bitrate
> 0"). Los op te pakken (gaps #17). Niet blokkerend voor beeldkwaliteit.

> **Handmatig weer live na een afgeronde broadcast** (tot de agent dit doet): maak in
> YouTube Studio → 📅 Manage → **Schedule Stream → Reuse settings** een nieuwe uitzending
> op de bestaande key, en doe in OBS **Stop → Start Streaming** zodat YouTube de verse
> verbinding aan de nieuwe broadcast koppelt (anders blijft 'ie op "Preparing stream"
> hangen). Met **Auto-start = aan** gaat 'ie dan vanzelf live.

> **Dashboard-schakelaars:** `Sponsors` (= toggelt `Sponsor slideshow`),
> `Scoreboard`, `Scores other tables`, `Cuescore logo` — elk los aan/uit.
> `Camera` staat altijd aan (geen schakelaar). Ik generaliseer het overlay-model:
> `config/tables.json` bevat de lijst overlaybronnen en het planning-record
> `overlays` wordt een map `{ naam: aan/uit }` — zo is elke overlay vanuit het
> dashboard te schakelen zonder hardcoding.

## Aanbevolen structuur & volgorde in de Sources-lijst
In OBS bepaalt de volgorde de **z-volgorde**: **bovenaan = bovenop**, onderaan =
achtergrond. Camera onderaan, overlays erboven. Sinds besluit 09-07 zit **alle
sponsoring in één `Sponsor slideshow`** (geen aparte logo's/groep meer):

```
Scène (Tafel N)
├─ Scoreboard                (deze tafel; "Next match will start shortly" als idle)
├─ Scores other tables       (andere tafels, rechtsboven)
├─ Cuescore logo             (zeshoek op de tafel)
├─ Sponsor slideshow         (ALLE sponsors roterend — dashboard-schakelaar "Sponsors")
└─ Camera Tafel N            (achtergrond, onderaan)
```

**Tip:** noem de bronnen precies zoals ze straks in het dashboard heten
(dashboard-label = bronnaam), dan matcht het uitleg-/overzichtscherm 1-op-1.

## Positie & grootte van overlays gelijktrekken
De plaatsing verschilt nu per instantie. Maak 'm identiek:
- **Browser-overlays** (`Scoreboard`, `Scores other tables`): de webpagina positioneert
  de graphic zelf binnen een transparant vlak → zet de bron op **Fit to screen**
  (rechtsklik → *Transform → Fit to screen*, of Ctrl+F). Dan vult 'ie het beeld en
  staat 'ie op alle 4 automatisch gelijk.
- **Afbeelding-overlays** (`Cuescore logo`, `Sponsor slideshow`): rechtsklik →
  *Transform → **Edit Transform*** (Ctrl+E) en zet dezelfde **Position** +
  **Bounding Box Size** op alle 4. Noteer de waarden zodat het reproduceerbaar is.
- **Let op (24e2cfb-vervolg):** Tafel 15 miste het `Scoreboard`-beeld — check de
  browser-URL (`?t=61403800` voor tafel 15) + *Fit to screen* als 'ie buiten beeld
  staat.

**Layout-standaard (toegepast 2026-07-09, referentie = Tafel 1):**

| Overlay | Transform |
|---|---|
| `Scoreboard` | **Fit to screen** (Ctrl+F) — vult beeld, webpagina plaatst de stand |
| `Scores other tables` | **Fit to screen** (Ctrl+F) |
| `Cuescore logo` | **Fit to screen** — logo staat gecentreerd |
| `Sponsor slideshow` | **Edit Transform**: **Bounds = `Fit`** • Bounds Size `450×260` • **Bounds-alignment rechtsboven** • **Positional alignment rechtsboven** • Position `1905,15` (2e herziening 11-07). Reden: sponsorlogo's hebben verschillende afmetingen; `Fit` + rechtsboven-uitlijning laat elk logo met dezelfde rechter- + bovenlijn plakken. (1e herz.: van linksboven `0,0` → rechtsboven omdat 'ie de header overlapte + links werd afgesneden.) |
| `Camera Tafel N` | **Fit to screen** (achtergrond) |

> Slotje open om te transformeren, daarna weer dicht (voorkomt per ongeluk verslepen).

## Kleurcodering (optioneel, aanrader)
Rechtsklik een bron → **Set Colour** om ze per categorie te kleuren. Op alle 4 de
instanties **dezelfde kleuren** → de lijst is meteen scanbaar en uniform. Voorstel:

| Categorie | Bronnen | Kleur |
|---|---|---|
| Scoreborden | `Scoreboard`, `Scores other tables` | blauw |
| Logo | `Cuescore logo` | paars |
| Sponsoring | `Sponsor slideshow` | geel/oranje |
| Camera | `Camera Tafel N` | groen |

> Kleur is puur visueel in OBS (geen invloed op de stream of de agent) — maar wel
> handig bij het bedienen en checken.

## Tafelnummer zichtbaar maken (jouw punt)
Nu staat nergens welk tafelnummer het is (de taakbalk toont "Profile: Naamloos").
Drie lagen, van belangrijk naar optioneel:

1. **In de vensternaam / taakbalk** ⭐ (lost je verzoek direct op):
   OBS zet de **profielnaam** en **scene-collection-naam** in de titelbalk. Noem
   die per instantie naar de tafel, dan wordt de titel
   `OBS 32.1.2 - Portable Mode - Profile: Tafel 1 - Scenes: Tafel 1` en zie je bij
   hover op de taakbalk meteen welke tafel het is.
   - **Profiel hernoemen:** menu **Profile → Rename** → `Tafel 1`
   - **Scene Collection hernoemen:** menu **Scene Collection → Rename** → `Tafel 1`
2. **Kijkers**: zien het al in de **YouTube-titel** (`Tafel {nr} {toernooinaam}`) —
   dat regelt ons systeem automatisch.
3. **Optioneel op beeld**: een kleine tekstbron `Tafelnummer` met "Tafel N" in de
   scène (rustig hoekje). Dit is dan het **enige bewuste verschil** tussen de
   instanties.

## Stappen per instantie (samen te doorlopen)
Per OBS-instantie (Tafel 1, 3, 15, 16), in deze volgorde:
1. **Profile → Rename** → `Tafel N`  •  **Scene Collection → Rename** → `Tafel N`
   (→ tafelnummer zichtbaar in taakbalk/titelbalk).
2. **Bronnen hernoemen** naar de standaard (dubbelklik bron → Rename): `Scoreboard`,
   `Scores other tables`, `Cuescore logo`, `Sponsors` (groep) met daarin
   `Sponsor - Buffalo`/`- Kamui`/`- GO Customs` + `Sponsor slideshow`, en
   `Camera Tafel N`. Casing exact gelijk, en zet de **volgorde** zoals hierboven
   (Camera helemaal onderaan). Optioneel: kleurcodering (zie boven).
3. **obs-websocket aanzetten**: Tools → WebSocket Server Settings → *Enable*,
   eigen poort (bijv. 1→4455, 3→4456, 15→4457, 16→4458), wachtwoord noteren.
4. (Optioneel) tekstbron `Tafelnummer` = "Tafel N" toevoegen.
5. (Optioneel) `Begint zo`-scène toevoegen (zelfde naam op alle) voor de pre-roll.
Ik noteer per instantie de poort + de exacte bronnamen; die gebruiken we straks in
`config/tables.json` + `agent-config.json`.

## Backup / template (aanrader — doe dit ná het inrichten)
- **Scene Collection → Export** per instantie → `.json` met scenes + bronnen +
  transforms. Dat is je **template + backup**. Bewaar op een vaste plek
  (bijv. `C:\Mokum-OBS-backup\`).
- **Hergebruik als template:** importeer de `.json`, pas dan alleen de twee
  tafel-specifieke dingen aan: de **camerabron** (video-device) en de
  **Scoreboard-URL** (`?t=<tableId>` — 1=61403749, 3=61403764, 15=61403800,
  16=61403803).
- **Profile → Export** bewaart de output-/encoder-instellingen.
- Extra vangnet: kopieer de hele **portable-map** (1-op-1 backup).

## Meteen meenemen (aanraders)
- **"Begint zo"-scène** per instantie (zelfde naam, bijv. `Begint zo`) voor de
  **pre-roll** — dan kan de agent straks bij de start van "begint zo" naar de
  tafelscène wisselen.
- **Consistente audio-opzet** (voor later commentaar; nu geen muziek).
- **OBS-mappen buiten OneDrive** zetten (zie `wiki/gaps.md` #9) — voorkomt
  sync-/vergrendelingsproblemen.

## Aansluiting op de code
- De agent toggelt overlays op **bronnaam**. Zodra de namen vaststaan werk ik het
  overlay-model bij: `config/tables.json` krijgt de lijst overlaybronnen
  (`Sponsors`, `Sponsor slideshow`, `Scorebord`, `Scores andere tafels`,
  `Cuescore logo`) en het planning-record `overlays` wordt een map
  `{ naam: aan/uit }`. Nu staat er nog `OVERLAY_BRON = { sponsors: 'Sponsors',
  scoreboard: 'cs score' }` in `backend/src/agent/commandQueue.js` — die pas ik aan
  op de definitieve namen.
- **Dashboard-overzicht/uitleg (jouw wens):** we kunnen per overlay **naam +
  beschrijving + een thumbnail/foto** tonen. Jouw foto's van wat elke overlay doet
  zijn daar perfecte input voor — ik maak er een "overlay-catalogus" van die het
  dashboard rendert.
