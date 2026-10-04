# Overdracht 04-10 (avond) — herinneringsmail na de starttijd (#176)

## Context
Op zondag 04-10 kwam om 17:31 de mail "Vanavond 11:00 — 5th Anniversary edition OnePocket.org
Member tournament staat nog niet ingepland", terwijl dat toernooi om 11:00 al was begonnen.
Zie ook [2026-10-04-nachtstop-datumfix-t16-handover.md](2026-10-04-nachtstop-datumfix-t16-handover.md)
voor de rest van die dag.

## Rode draad
Twee dingen kwamen samen: de workflow draaide ruim 4 uur te laat, en het filter in de
herinnering keek niet naar de starttijd. Beide zijn aangepakt; het bewijs dat het werkt volgt
pas bij de run van 05-10.

## Oorzaak (uit het log van run 37213339592)
- De cron stond op `0 11 * * *` (13:00 zomertijd), maar GitHub voerde hem pas uit om
  15:31 UTC = 17:31 lokaal. Dat late uitvoeren stond al als risico in de workflow (04-08: 2 uur).
- `tekort()` in `backend/src/rapport/herinnering.js` filterde op datum, `planned`, `enabled`,
  `geannuleerd` en status `live`/`klaar`, maar niet op de starttijd. Een toernooi van 11:00 dat om
  17:31 niet als live/klaar stond, kwam dus door het filter. Het onderwerp zei bovendien altijd
  "Vanavond".
- Niet uitgezocht: welke status dit toernooi in de planning had en of er die dag tafels met de hand
  zijn gestart (de tafels waren vandaag wel gestart, zie broadcasts/2026-10-04.json).

## De fix (issue #176, commit `6bf6771`, PR #177)
1. Toernooien waarvan `startOverride || plannedStart` al voorbij is, worden niet meer gemeld.
   Is de starttijd niet leesbaar, dan komt de mail voor de zekerheid wel.
2. "Vandaag" i.p.v. "Vanavond" in onderwerp, platte tekst en html.
3. Cron naar `0 6 * * *` (08:00 zomer / 07:00 winter) in `.github/workflows/planning-herinnering.yml`.
- Drie tests erbij in `backend/test/rapport.test.js`; 56/56 groen, lint schoon.
- Gemerged naar main door Peter (`gh pr merge 177 --merge`; mijn eigen merge werd door de
  permissiecontrole geweigerd). Deploy groen, `/api/health` meldde commit `a740574`.

## Besluiten
- Peter wilde alle drie de wijzigingen, en daarna alles wat op develop openstond naar main.
- Vóór de merge is gecontroleerd: `git log origin/main..develop`, geen conflicten
  (`git merge-tree`), en er stond niets live (alle 4 tafels van 04-10 gestopt).

## Wat er nog open staat
- **#176 blijft open** tot de run van 05-10 rond 08:00 lokaal (of later, GitHub kan vertragen) is
  gecontroleerd: `gh run list --workflow planning-herinnering.yml`. Gewenst resultaat: stilte als
  alles ingepland is, geen mail over een voorbij toernooi.
- Tafel 15 van 04-10 stond op `finalized: false` ten tijde van de deploy. Controleer in
  `broadcasts/2026-10-04.json` of de timer dat na de herstart heeft gedaan.
- Deze overdracht staat alleen op develop. Naar main alleen met Peters expliciete akkoord.

## Zijspoor (niet in de repo)
Voor een kennis (kanaal Orange Forks Productions) is een stappenplan voor automatische
YouTube-hoofdstukken uit Cuescore gemaakt, naar het voorbeeld van `backend/src/video/hoofdstukken.js`.
Het kanaal zelf was niet in te zien. Het voorbeeldscript is niet getest; de tijdzone en het
tijdformaat van `starttime` in de Cuescore-API zijn niet gecontroleerd. Dat is een los onderwerp en
hoort niet bij Mokum.

## Waar de kennis verder staat
- Issue #176, PR #177, `.github/workflows/planning-herinnering.yml` (uitleg over de cron-vertraging).
- `backend/src/rapport/herinnering.js` en de tests onder "Herinnering" in `backend/test/rapport.test.js`.
