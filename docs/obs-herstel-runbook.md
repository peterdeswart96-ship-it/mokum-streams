# OBS-herstel-runbook — juiste overlays terug + uit OneDrive (2026-07-13)

> Aanleiding: OneDrive stond lang stil (schijf vol door een 70GB-map op het
> bureaublad). Na opruimen synchroniseerde OneDrive een **oude** versie van de
> portable OBS-mappen terug en **overschreef de goede overlay-config**. Gevolg
> (plaatje 2): bronnen `Scores other tables` + `Cuescore logo` weg, een vreemde
> `Challenge SB` erbij. Doel: de goede config (plaatje 1) terug + OneDrive
> definitief buitenspel. Zie ook issue **#19** en `docs/obs-standaard.md`.

## 0. Wat het dashboard verwacht (hoofdlettergevoelig!)
De overlay-knoppen sturen op **exacte bronnamen**. Elke tafel-scene moet hebben:

| Dashboard-knop | OBS-bronnaam (exact) |
|---|---|
| Camera (altijd aan) | `Camera Tafel N` |
| Sponsors | `Sponsor slideshow` |
| Scorebord | `Scoreboard` |
| Scores andere tafels | `Scores other tables` |
| Cuescore-logo | `Cuescore logo` |
| (pauze) Jumbotron | `Jumbotron` |
| (pauze) Pauzemelding | `Pauzemelding` |

- **Geen** `Challenge SB` of andere afwijkende naam (die worden door de knoppen niet
  gevonden). `Jumbotron`/`Pauzemelding` mogen nu ontbreken (voor het pauzescherm later).
- Profiel + Scene = `Tafel N`.

## 1. Belangrijk vóór je begint
- **De streams draaien nu live** (semi's op tafel 1/3). Config herstellen/importeren
  **onderbreekt de stream** van die tafel. Doe het dus **per tafel zodra die vrij is**,
  of wacht tot het toernooi klaar is. Niet nodig om alles tegelijk te doen.
- **De overlay-KNOPPEN op het dashboard werken pas als de agent draait** (die verbindt
  met OBS via websocket). Vandaag = overlays correct terug + OneDrive weg + websocket
  klaarzetten. De agent zelf draaien is de vervolgstap (#11).
- **Secrets nooit in chat/repo**: websocket-wachtwoorden en stream keys alleen lokaal /
  in env. Noteer ze veilig (wachtwoordkluis).

## 2. Doelmap kiezen (buiten OneDrive) — #19
- Portable OBS-mappen → **`C:\MokumOBS\Tafel-1`, `…\Tafel-3`, `…\Tafel-15`, `…\Tafel-16`**
  (of een andere map **buiten** `…\OneDrive\…`). Dit haalt OneDrive er blijvend uit.
- Sponsorafbeeldingen → **`C:\Mokum-Sponsors\`** (lokaal, buiten OneDrive).

## 3. Herstel per tafel — jouw export = **Scene Collection (JSON)**
> Volgorde is belangrijk: **eerst uit OneDrive**, dán importeren. Anders schrijft OBS de
> geïmporteerde scene weer terug in de OneDrive-map en kan het opnieuw overschreven worden.
> De scene collection bevat **alleen scenes/bronnen** — kwaliteit, websocket en stream key
> zitten in het **profiel/global** en zet je apart (stap 4/5).

1. In díe OBS: **Stop Streaming** → **OBS volledig sluiten**.
2. **Portable map uit OneDrive halen:** kopieer de hele map
   `…\OneDrive\Bureaublad\OBS Tafel N\` → **`C:\MokumOBS\Tafel-N\`**. Start OBS voortaan via
   `C:\MokumOBS\Tafel-N\…\obs64.exe`.
3. **Goede scenes importeren:** in OBS → **Scene Collection → Import** → kies jouw goede
   JSON-export voor díe tafel → **Scene Collection → er naartoe wisselen**. Verwijder daarna
   de foute collection (met `Challenge SB`) via Scene Collection → Manage, zodat de **goede**
   actief staat.
4. **Oude OneDrive-map verwijderen** (`…\OneDrive\Bureaublad\OBS Tafel N\`) ná verificatie,
   zodat OneDrive niets meer terugzet.

## 4. Controle-checklist per tafel
- [ ] Bronnen exact aanwezig: `Camera Tafel N`, `Scoreboard`, `Scores other tables`,
      `Cuescore logo`, `Sponsor slideshow`. `Challenge SB` **weg**.
- [ ] `Scoreboard` (browser-source) wijst naar de **eigen** Cuescore tableId
      (1=61403749, 3=61403764, 15=61403800, 16=61403803).
- [ ] `Sponsor slideshow` → map `C:\Mokum-Sponsors\` (lokaal, niet OneDrive).
- [ ] Kwaliteit (nu je toch bezig bent, #32): CBR **16000 kbps**, 1080p60, NVENC P6 —
      zie `docs/obs-standaard.md`. (Vergt herstart stream; alleen bij een vrije tafel.)
- [ ] Stream key = de herbruikbare liveStream van díe tafel.

## 5. obs-websocket klaarzetten (voor de agent)
Per instantie: **Tools → WebSocket Server Settings** → *Enable* aan.
- Poort per tafel: **1 → 4455, 3 → 4456, 15 → 4457, 16 → 4458**.
- Zet per instantie een **wachtwoord** en noteer het veilig. Deze komen later in de
  agent als env-vars `OBS_PASSWORD_TAFEL_1/3/15/16` (zie `agent/agent-config.example.json`).

## 6. OneDrive definitief ontkoppelen
- OBS-mappen staan nu in `C:\MokumOBS\…` (buiten OneDrive) → OneDrive raakt ze niet meer.
- **Batch-launcher** `start-alle-obs.bat` bijwerken naar de nieuwe paden.
- Oude `OBS Tafel N`-mappen uit OneDrive/Bureaublad verwijderen.
- *(Als iets tóch in OneDrive moet blijven: rechtsklik map → "Altijd behouden op dit
  apparaat" — maar buiten OneDrive is veiliger.)*

## 7. De agent draaien (dashboard-knoppen laten werken)
De **agent** draait op de **OBS-pc zelf** (verbindt met `127.0.0.1:445x`). Hij pollt onze
backend voor commando's en post per tafel de status → daardoor tonen de tafels op het
dashboard "live" en gaan de overlay-knoppen echt togglen.

1. **Node.js** op de OBS-pc? Check `node -v` (LTS ≥ 18). Zo niet: installeren.
2. **Agent-code** op de pc: `git clone` van de repo (of kopieer de map `agent/`), dan in
   `agent/`: `npm install`.
3. **Config:** kopieer `agent/agent-config.example.json` → `agent-config.json` (tafels
   1/3/15/16 op poort 4455/4456/4457/4458 staan er al in).
4. **Secrets als env-vars** (niet in het bestand):
   - `AGENT_TOKEN` = **exact** de `AGENT_TOKEN` uit de Azure Function App-instellingen.
   - `OBS_PASSWORD_TAFEL_1/3/15/16` = de websocket-wachtwoorden uit stap 5.
5. **Rotatie:** de voorbeeldconfig rouleert `scoresOtherTables` (elke 180s, 20s aan) → dat
   toggelt die overlay zichtbaar op de **live** stream. Wil je dat nu niet, haal dan het
   `rotations`-blok (tijdelijk) weg.
6. **Starten:** in `agent/` → `node index.js`. Let op de log: *verbonden* met alle 4 OBS,
   *status gepost*. Op het dashboard flippen de tafels dan naar **live** en tonen ze de
   echte overlay-standen.
7. **Testen (voorzichtig — er zijn live streams):** toggle op het dashboard één overlay op
   **één** tafel en kijk of die in OBS aan/uit gaat. Doe **start/stop via het dashboard bij
   voorkeur op een vrije tafel** (dat maakt een YouTube-broadcast aan + start OBS-streaming).

> Waarschuwing: de agent draaien tijdens het live toernooi is grotendeels lees-werk +
> overlay-toggles, maar **start/stop** raakt de uitzending. Test start/stop op een tafel die
> niet live is, of na afloop.

## Volgorde-advies
1. **Uit OneDrive + goede scenes terug** (stap 2–4) per tafel zodra die vrij is — dit is het
   belangrijkst en voorkomt herhaling.
2. **Websocket + kwaliteit** (stap 5–6).
3. **Agent** (stap 7) als het bovenstaande stabiel is; start/stop bij voorkeur op een vrije tafel.
