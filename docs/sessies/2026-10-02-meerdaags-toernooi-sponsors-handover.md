# Overdracht 02-10 — meerdaags One Pocket-toernooi, tijdelijke sponsors en nachtstop-tekst

## Context
Nick wilde het "5th Anniversary edition OnePocket.org Member tournament"
(Cuescore-ID 74776897, 2 t/m 4 oktober, tafel 1/3/15/16) laten streamen, maar het stond
niet in de wizard-dropdown "Cuescore-toernooi". Het 8ball-toernooi van die avond bleek
niet de oorzaak (stond op Concept, "niet meer bij Cuescore").

## Wat er is gedaan

### Diagnose: een toernooi langer dan 26 uur is voor ons een competitie
- `bepaalType` in `backend/src/planning/planning.js` maakt van elk evenement met een
  duur > 26 uur het type `competition` (bedoeld voor de 14.1-league). Het type wordt bij
  élke import opnieuw afgeleid, dus een handmatige correctie blijft niet staan.
- Gevolgen voor een `competition`: de wizard toont het alleen onder "14.1 league"
  (`toernooienVanType` in `frontend/src/App.jsx`), `planningDue` start er geen
  automatische uitzending voor, en een league-stream stopt na één partij.
- One Pocket (2 okt 11:00 → 4 okt) viel daardoor weg onder "Cuescore-toernooi".

### Workaround voor dit weekend (besluit Peter + Nick)
- Nick zet in Cuescore start en eindtijd binnen 26 uur: vandaag 11:00 → morgen 03:00.
  Daarna wordt het een gewoon `tournament`, staat het onder "Cuescore-toernooi", werkt het
  scorebord en sluit de stream bij de finale (of de nachtstop 03:00).
- Elke dag opnieuw: start en eindtijd in Cuescore naar die dag zetten, import afwachten
  (elk uur, of **↻ Ververs** in de Toernooi planner), wizard per tafel (1, 3, 15, 16).
- "Custom stream" (geen scorebord) en "14.1 league" (stopt na elke partij) zijn bewust
  afgevallen. Peter stopt de streams zelf zodra de laatste partij gespeeld is.
- NIET getest: of de import de gewijzigde Cuescore-tijden daadwerkelijk overneemt en het
  record van type wisselt. Peter ging dit op de dag zelf controleren.

### Bank Pool-side-event
- "SIDE-EVENT | Bank Pool" staat gepland voor **3 oktober 20:00 op tafel 1 en 3** (was in
  de planner "Morgen"). Vandaag geen conflict.
- Let op voor **morgen**: `planning/vrijmaken.js` sluit om 19:30 alles op tafel 1 en 3 dat
  niet bij Bank Pool hoort (ook handmatig gestarte streams van het hoofdtoernooi, zonder
  rekening te houden met een lopende partij). Om ~19:50 start Bank Pool zelf. Peter en
  Nick moeten dus vóór 19:30 kiezen: tafel 1/3 vrijgeven, of Bank Pool annuleren/verplaatsen.

### Nachtstop-tekst in de wizard — commit 903a36f
De wizard noemde "02:00" als nachtstop; de echte default is **03:00**
(`NACHT_STOP_SLUITING_MIN`=180, `backend/src/functions/nachtStop.js`). Teksten bij
Challenge/Custom/de gele waarschuwing en de commentaren aangepast. `tafelClaims` rekende
met `setHours(2…)` en gebruikt nu 3 (enige gedragswijziging, alleen in de wizard).
Backend-commentaren met "02:00" (`config/automation.js`, `functions/checkStops.js`) zijn
nog niet aangepast. Staat op develop, nog niet op main.

### Tijdelijke sponsors
- Vijf plaatjes (OnePocket.org, HDP Billar, 8nOUT, Gameworks, Joseph J. Long) omgezet naar
  640×440 PNG (2× het OBS-vak Fit 320×220), map `Downloads\temp sponsors\klaar`.
  `joseph-long.png` is uiteindelijk niet naar de OBS-pc gekopieerd.
- De OBS-pc leest `C:\Mokum-Sponsors`. De slideshow las de nieuwe bestanden **niet** in
  (teller bleef "1/2"), ook niet na oogje uit/aan en OK. Wat werkte: per OBS-venster
  (tafel 1, 3, 15, 16) in Properties het mappad verwijderen → OK → opnieuw **+ → Add Folder**.
- `docs/handleiding-nick.md` was hierover onjuist en is gecorrigeerd — commit 39df4ac.

## Besluiten
- Dit weekend: geen code voor meerdaagse toernooien; de Cuescore-tijdtruc is de oplossing.
- Niets naar main gemerged; 903a36f en 39df4ac staan alleen op develop.

## Wat er nog open staat
1. **Structurele oplossing** (voorgesteld, niet goedgekeurd, geen issue): een veld
   "meerdaags toernooi" op het planning-record dat het type vastzet en door de import niet
   wordt overschreven, met planninglogica voor dagelijkse starttijden. Eerst
   `docs/api-contract.md` bijwerken. Eerst een issue aanmaken vóór er een nummer in code komt.
2. **Na het weekend:** de tijdelijke sponsors uit `C:\Mokum-Sponsors` halen en de map in
   alle vier de OBS-vensters opnieuw toevoegen.
3. **Morgen (3 okt):** Bank Pool 20:00 op tafel 1 en 3 versus het hoofdtoernooi (zie boven).
4. Verifiëren dat de Cuescore-tijdwijziging inderdaad in de planner terechtkwam en dat de
   streams met scorebord liepen; uitkomst staat niet in deze overdracht.
5. Nachtstop-comments in de backend naar 03:00 corrigeren (klein, alleen commentaar).
6. Merge develop → main voor 903a36f en 39df4ac is Peters besluit.

## Waar de kennis verder staat
- `backend/src/planning/planning.js` (`bepaalType`), `backend/src/planning/vrijmaken.js`,
  `frontend/src/App.jsx` (Wizard, `tafelClaims`, `STREAM_TYPES`).
- `docs/obs-standaard.md` (sponsor-slideshow: Fit 320×220), `docs/handleiding-nick.md`.
- Issue #146 (waarschuwing vooraf: tafel later vrijgemaakt) is de bestaande context voor
  de vrijmaak-waarschuwing in de wizard.
