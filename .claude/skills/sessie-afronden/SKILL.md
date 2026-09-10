---
name: sessie-afronden
description: Sluit de huidige chatsessie netjes af — schrijf een overdrachtsdocument, ruim GitHub-issues op en herinner Peter eraan een verse chat te starten voor het volgende onderwerp. Gebruik dit aan het eind van een sessie waarin daadwerkelijk iets is gebouwd/gefixt/besloten, of wanneer Peter vraagt om af te sluiten/documenteren/te archiveren.
allowed-tools: Bash(git *) Bash(gh *) Bash(node *) Bash(npm *) Read Write Edit Grep Glob
arguments: [onderwerp]
---

Je rondt een werksessie in mokum-streams af. Peter wil sinds 10-09-2026 per chat één
issue/onderwerp behandelen en dan bewust een verse chat starten — dit is het moment
waarop je dat mogelijk maakt: alles wat niet in de repo staat, staat straks nergens
meer (CLAUDE.md: "Dit project houdt zijn geheugen in de repo, niet in een chat").

Optioneel meegegeven onderwerp van deze sessie: $onderwerp — gebruik dit als titel/
insteek voor de overdracht als het is meegegeven, maar leid de inhoud altijd af uit
wat er in DEZE sessie daadwerkelijk is gebeurd, niet uit de tekst van het argument.

Doorloop deze stappen, in deze volgorde:

## 1. Inventariseer wat er deze sessie is gebeurd

Kijk naar de conversatie zelf (wat is gebouwd, gefixt, besloten, onderzocht) én naar
`git log` / `git diff` sinds het begin van de sessie om zeker te weten dat je niets
mist. Onderscheid:
- Code die is gewijzigd en gedeployed (naar `develop` en/of `main`).
- Besluiten die Peter heeft genomen (scope-keuzes, tijdslimieten, prioriteiten).
- Dingen die zijn ONDERZOCHT maar niet opgelost (open eindjes voor de volgende sessie).

## 2. Issuenummers in de code controleren (voorkomt het #118/#80-probleem van 10-09)

Draai:
```
grep -rohE "#[0-9]+" backend/src/ agent/src/ 2>/dev/null | sort -u
```
en vergelijk de gevonden nummers met `gh issue list --state all --limit 250 --json number`.
Filter handmatig kleuren/hex-codes eruit (bijv. `#000`, `#565656`) — dat zijn geen
issueverwijzingen. Voor elk nummer dat:
- **niet bestaat als issue OF PR** → zoek uit welke feature het comment beschrijft, maak
  een backfill-issue aan met `gh issue create` dat die feature correct documenteert, sluit
  het direct met een verwijzing naar de commit(s) waar de feature al in zit, en corrigeer
  de code-comments naar het echte nummer.
- **wél bestaat, maar over een ANDER onderwerp gaat dan het comment beschrijft** → zelfde
  aanpak: backfill-issue voor de juiste feature, comments corrigeren.

Nooit een nummer in code zetten vóórdat het issue echt bestaat (zie het geheugen
"Nooit issuenummers raden in code" — dit is precies waarom die regel er is).

## 3. Openstaande issues nalopen die deze sessie mogelijk zijn opgelost

Zoek in `gh issue list --state open` naar issues die inhoudelijk raken aan wat deze
sessie is gedaan (ook issues van VOOR deze sessie die toevallig al gefixt bleken, zoals
#94 en #117 op 10-09). Sluit ALLEEN een issue als je concreet kunt aantonen dat het is
opgelost: de fix staat in de code, de tests slagen, en de workflow naar `main` is groen
(werkafspraak 9 in CLAUDE.md: "Issues pas sluiten nadat: workflow groen ÉN geslaagde
test"). Bij twijfel: issue open laten en in de overdracht noemen als "waarschijnlijk
opgelost, nog te bevestigen" — nooit voor de zekerheid toch maar sluiten.

Voor élk issue dat je aanmaakt of sluit: gebruik een duidelijke, feitelijke
Nederlandstalige omschrijving met wat er misging, de oorzaak, en de fix (met
bestandsnamen/commit-hashes) — dit IS de kennisbank voor de volgende sessie.

## 4. Schrijf het overdrachtsdocument

Nieuw bestand `docs/sessies/YYYY-MM-DD-handover.md` (datum van vandaag; als er al een
handover van vandaag bestaat, werk die bij in plaats van een tweede te maken). Bekijk
eerst 1-2 bestaande bestanden in `docs/sessies/` (nieuwste eerst) voor de vorm, en volg
diezelfde opbouw:
- Titel + korte context-blockquote (periode, aanleiding).
- Een "rode draad"/samenvattend stuk.
- Per onderwerp: wat er misging (bij een incident), de oorzaak, de fix, met
  bestandsnamen en waar mogelijk het issuenummer.
- Besluiten die Peter heeft genomen en die een volgende sessie moet kennen.
- "Wat er nog open staat" — eerlijk en specifiek, geen vage vlucht.
- "Waar de kennis staat" — links naar de relevante issues.

Schrijf dit voor een lezer die GEEN toegang heeft tot deze chat — alles wat niet in dit
document (of in de code/issues) staat, is na het sluiten van deze chat weg.

## 5. Commit en deploy het document

Volg de normale werkwijze (werkafspraak 2 in CLAUDE.md): eerst naar `develop`, dan pas
naar `main` na een expliciete bevestiging van Peter ("ja graag" op de vraag of je het
mag doorzetten) — ook al is het "maar" documentatie, dit is nog steeds een merge naar
`main` en dus Peters beslissing. Draai de backend-tests + lint als er ook code is
gewijzigd (bijv. door stap 2).

## 6. Werk je eigen geheugen bij (buiten de repo)

Volg de normale regels van je auto-memory-systeem: sla alleen op wat niet uit de repo
zelf is af te leiden — een non-obvious les over HOE Peter wil samenwerken (feedback),
of een lopend besluit dat nog niet in een issue/doc staat. Dupliceer NOOIT de inhoud
van het overdrachtsdocument zelf in het geheugen — verwijs er hooguit naar.

## 7. Sluit af met een korte samenvatting én de herinnering

Geef Peter een kort, leesbaar overzicht (geen technisch logboek): wat is er
gedocumenteerd, welke issues zijn aangemaakt/gesloten, wat staat er nog open. Sluit
altijd af met een concrete herinnering dat dit een goed moment is om een **verse chat**
te starten voor het volgende onderwerp — dat is precies waarom je deze skill draait.
