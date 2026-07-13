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

## 3. Herstel per tafel (herhaal voor 1, 3, 15, 16)
1. In díe OBS: **Stop Streaming** → **OBS sluiten**.
2. **Goede config terugzetten** — afhankelijk van wat je export precies is:
   - **Export = kopie van de hele portable OBS-map:** kopieer die map naar
     `C:\MokumOBS\Tafel-N\`. Start OBS via de `obs64.exe` in díe map (portable).
   - **Export = Scene Collection (JSON):** start OBS (op de nieuwe locatie),
     **Scene Collection → Import** → kies de export → **er naartoe wisselen**. Let op:
     profiel (kwaliteit/websocket) zit hier NIET in → check stap 4/5 apart.
   - *(Bij twijfel welke van de twee: stuur me een screenshot van één export-map/-bestand,
     dan zeg ik precies welke route.)*
3. **Oude OneDrive-map opruimen:** verwijder/leeg `…\OneDrive\Bureaublad\OBS Tafel N\`
   zodat OneDrive niet opnieuw iets terugzet.

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

## 7. Samenwerking met het dashboard testen
- **Nu (zonder agent):** overlays staan correct op de stream; het dashboard toont per
  tafel de live wedstrijd + het stream-embed. De tafels staan als "offline" omdat de
  streams **handmatig** in OBS gestart zijn (niet via onze backend) — dat is verwacht.
- **Volgende stap (voor knoppen + start/stop via dashboard, #11):** de agent draaien met
  `agent-config.json` (poorten uit stap 5 + de `OBS_PASSWORD_TAFEL_N`-env). Dan togglen de
  overlay-knoppen echt en kan de backend (armed) broadcasts plannen. Aparte sessie.

## Volgorde-advies
Doe **stap 2–6 per tafel op een moment dat die tafel vrij is** (of na afloop van het
toernooi). De OneDrive-ontkoppeling (stap 2 + 6) is het belangrijkst — dat voorkomt dat
dit nog eens gebeurt. De agent (stap 7) is een losse vervolgstap.
