# Overdracht 29-09 — firewall-incident zwart beeld + start van een FAQ

## Context
Stroomstoring vanochtend 10:11, OBS-pc automatisch terug om 10:22 (de BIOS-fix uit
#133 werkte). Maar de stream op tafel 1 (gestart 19:15) gaf vanaf 20:00 alleen zwart
beeld met de overlay zichtbaar. Peter heeft het zelf verholpen: een Windows Firewall-
melding 4x bevestigen + de camera's van alle tafels verversen (rechtermuisknop →
Properties → OK).

## Wat er is gedaan

### Root cause en fix — #167
Nieuw issue: [#167](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/167)
("Firewall-melding blokkeert automatisch herstel na koude opstart").

- **Oorzaak:** bij een koude opstart (na stroomverlies) toont Windows Firewall een
  eerste-gebruik-toestemmingsvraag per OBS-instantie. Er zijn 4 losse portable
  installaties (`C:\MokumOBS\Tafel-N\obs-studio\bin\64bit\obs64.exe`, N = 1/3/15/16),
  dus 4 losse prompts. Dat is een blokkerend dialoogvenster — zonder iemand die het
  wegklikt, blijft de stream vast. Dit ondermijnt het doel van de stroomuitval-
  autorecovery uit #133 (pc start wel vanzelf op, maar hangt daarna op een menselijke
  bevestiging).
- **Tijdlijn** (comment op #167): storing 10:11 → pc terug 10:22 → stream start 19:15
  → probleem opgemerkt 20:00. De melding stond dus al ~9,5 uur klaar voordat iemand
  het zag, simpelweg omdat er niemand bij de pc was.
- **Camera-refresh** na de firewall-fix is een apart, al bekend punt — zie het
  openstaande item in #43 ("RTSP-bronnen automatisch laten herverbinden"). Geen nieuwe
  oorzaak, wel een extra databewijs.
- **Voorgestelde fix** (nog NIET uitgevoerd op de pc): een permanente
  `New-NetFirewallRule` voor alle 4 obs64.exe-paden, zodat de prompt nooit meer
  verschijnt. Het PowerShell-script staat in #167.
- **Mail naar Nick/Mark**: in de chat is een korte, informele uitleg opgesteld (oorzaak
  + wat we eraan doen) — niet in de repo opgeslagen, Peter plakt 'm zelf.

### Nieuwe FAQ — `docs/faq-storingen.md`
Op Peters verzoek is een nieuw, blijvend document gestart: een korte FAQ van
veelvoorkomende storingen, ook leesbaar voor Nick/Mark (geen jargon). Eerste punt is
het firewall/zwart-beeld-incident hierboven. `CLAUDE.md` verwijst er nu naar onder
"Waar de kennis staat", met de afspraak: bij het afronden van een storing-issue die
zich kan herhalen, hier een punt bijschrijven (niet elk klein eenmalig issue).

### Gecommit en gedeployed
Commit `4c22fc1` op `develop`, na Peters expliciete akkoord gemerged en gepusht naar
`main` (fast-forward, geen conflicten). Bevat: `docs/faq-storingen.md` (nieuw) en de
aanvulling in `CLAUDE.md`.

## Besluiten deze sessie
- FAQ-document hoort in de repo (`docs/faq-storingen.md`), niet in een los gedeeld
  document — blijft zo doorzoekbaar en versiebeheerd samen met de rest.
- Doelgroep van de FAQ is expliciet ook Nick/Mark, niet alleen Peter/Claude — dus
  bewust simpele taal, geen technisch jargon.

## Wat nog openstaat
- **#167 is nog NIET dichtgemaakt.** De firewall-regel moet nog daadwerkelijk op de
  OBS-pc gezet worden (eenmalig, via Chrome Remote Desktop of ter plekke). Pas na de
  volgende koude opstart (geplande herstart ma/do 06:00, of een volgende
  stroomstoring) zonder de melding, kan het issue dicht en de FAQ-status op
  "structureel opgelost" bevestigd worden.
- Mail naar Nick/Mark is opgesteld in de chat maar nog niet verstuurd — dat doet Peter
  zelf.
- #43 blijft openstaan voor de camera-refresh-na-cold-boot-kant (los van dit issue).

## Waar de kennis verder staat
- [#167](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/167) — volledige
  diagnose, tijdlijn en het firewall-fix-script
- `docs/faq-storingen.md` — de korte, praktische samenvatting
- #133, #43 — achtergrond over de stroomuitval-autorecovery en de camera-refresh
