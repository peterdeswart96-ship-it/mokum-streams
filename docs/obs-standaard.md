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

## Standaard-bronnamen (identiek op elke instantie)
Nu lopen de namen uiteen (`gO`/`Go`, `sPON`/`Sponsors`, `bUFFALO`/`Buffalo`,
`KaMUI`/`Kamui`). Voorstel voor één duidelijke set — **exact gelijk** (incl.
hoofdletters) op alle vier de instanties:

Namen in het **Engels** (afgesproken 2026-07-09); het **tafel-token blijft
`Tafel N`** zoals in de YouTube-titel.

| Doel | Standaardnaam | Wat het is |
|---|---|---|
| eigen scorebord (`score`) | `Scoreboard` | scorebord van **deze** tafel (onder); toont "Next match will start shortly" als er geen wedstrijd loopt |
| andere tafels (`cs score`) | `Scoreboard other tables` | roterende scores van **andere** tafels uit het toernooi (rechtsboven); leeg zonder toernooi |
| Cuescore-logo (`Modern`) | `Cuescore logo` | het Cuescore-logo (zeshoek op de tafel) |
| sponsoring | `Sponsors` | **groep** met alle sponsoring — één dashboard-schakelaar |
| — logo (`Buffalo`) | `Sponsor - Buffalo` | statisch sponsorlogo (in de groep) |
| — logo (`Kamui`) | `Sponsor - Kamui` | statisch sponsorlogo |
| — logo (`Go`) | `Sponsor - GO Customs` | statisch sponsorlogo |
| — slideshow (`Sponsors`/`Image Slideshow`) | `Sponsor slideshow` | roterende sponsorafbeelding (Mokum/GO) — in de groep |
| camera (`Tafel N`) | `Camera Tafel N` | de tafelcamera (achtergrond) |

> **Bestaande bronnen verschillen per instantie — let op bij het toepassen:**
> - De bron die nu `Sponsors` heet (o.a. Tafel 1) is eigenlijk de **slideshow** →
>   hernoem naar `Sponsor slideshow`, maak dan een **nieuwe groep** `Sponsors` en
>   sleep de logo's + slideshow erin.
> - **Tafel 16 mist `Scoreboard`** (`score`) → toevoegen (browser-source; kopieer de
>   URL/instellingen van een tafel die 'm wél heeft — de URL is vermoedelijk
>   per-tafel).
> - Elke instantie moet uiteindelijk **dezelfde set + dezelfde namen** hebben.

**Overig gelijk:** obs-websocket aan (eigen poort 4455/4456/4457/4458 + wachtwoord),
stream key = de herbruikbare liveStream van díe tafel, zelfde output (bijv. 1080p
~5000 kbps).

> **Dashboard-schakelaars:** `Sponsors` (hele groep), `Scoreboard`,
> `Scoreboard other tables`, `Cuescore logo` — elk los aan/uit. `Camera` staat
> altijd aan (geen schakelaar). Ik generaliseer het overlay-model:
> `config/tables.json` bevat de lijst overlaybronnen en het planning-record
> `overlays` wordt een map `{ naam: aan/uit }` — zo is elke overlay vanuit het
> dashboard te schakelen zonder hardcoding.

## Aanbevolen structuur & volgorde in de Sources-lijst
In OBS bepaalt de volgorde de **z-volgorde**: **bovenaan = bovenop**, onderaan =
achtergrond. Zet dus de camera onderaan en de overlays erboven. Stop de
sponsorlogo's **in de `Sponsors`-groep** (nesten) — dan is de lijst kort en
toggelt één schakelaar alle logo's tegelijk.

```
Scène (Tafel N)
├─ Scoreboard                (deze tafel; "Next match will start shortly" als idle)
├─ Scoreboard other tables   (andere tafels, rechtsboven)
├─ Cuescore logo             (zeshoek op de tafel)
├─ Sponsors   [groep]        ← dashboard-schakelaar
│   ├─ Sponsor - Buffalo
│   ├─ Sponsor - Kamui
│   ├─ Sponsor - GO Customs
│   └─ Sponsor slideshow     (roterend Mokum/GO)
└─ Camera Tafel N            (achtergrond, onderaan)
```

**Tip:** noem de bronnen precies zoals ze straks in het dashboard heten
(dashboard-label = bronnaam), dan matcht het uitleg-/overzichtscherm 1-op-1.

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
2. **Bronnen hernoemen** naar de standaard (dubbelklik bron → Rename): `Scorebord`,
   `Scores andere tafels`, `Cuescore logo`, `Sponsors` (groep) met daarin
   `Sponsor - Buffalo`/`- Kamui`/`- GO Customs`, `Sponsor slideshow`, `Camera`.
   Casing exact gelijk op alle instanties, en zet de **volgorde** zoals hierboven.
3. **obs-websocket aanzetten**: Tools → WebSocket Server Settings → *Enable*,
   eigen poort (bijv. 1→4455, 3→4456, 15→4457, 16→4458), wachtwoord noteren.
4. (Optioneel) tekstbron `Tafelnummer` = "Tafel N" toevoegen.
5. (Optioneel) `Begint zo`-scène toevoegen (zelfde naam op alle) voor de pre-roll.
Ik noteer per instantie de poort + de exacte bronnamen; die gebruiken we straks in
`config/tables.json` + `agent-config.json`.

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
