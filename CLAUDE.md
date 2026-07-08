# CLAUDE.md — Mokum Streams

Projectspecifieke instructies voor Claude Code werkend in deze repo.

## Wat dit project is
Automatisering van YouTube-livestreams voor Mokum Pool & Darts (Amsterdam). Opdrachtgevers: Nick & Mark. Website beheerd door Boei17 (Sander). Zie `docs/projectplan.md` voor het volledige ontwerp en `docs/SKILL-mokum-streams.md` voor de referentie op hoog niveau.

## Vaste feiten
- YouTube-kanaal: @MokumPoolDarts (UCXb_CDaEhEO8CImYTvHalTw); account `pooleninmokum@gmail.com` (Peter heeft beheerderstoegang). Niet gemonetiseerd.
- Titeltemplate broadcasts: `Tafel {nr} '{sponsor}' {toernooinaam}`
- Tafels met camera: **1, 3, 15, 16** (zaal telt 16 pooltafels — echte zaalnummering aanhouden). NB: oude demo gebruikte 7/9/12/15 als voorbeeld — dat is achterhaald.
- Sponsornamen komen uit **Cuescore** (niet handmatig); voeden het `{sponsor}`-veld in de titel
- Eerste vaste toernooi (testcase fase 2/3): **Di 19:30 — Fluke ranking — tafel 1 & 3** (toernooinaam mag uit Cuescore)
- Zaalopstelling: één pc, **meerdere OBS-instanties** (elk eigen websocket-poort + wachtwoord), upload 120 Mbps bekabeld, pc mag 24/7 aan
- Infra: resource group `rg-mokum-streams`, Key Vault `kv-mokum-streams` (youtube-client-id/-secret/-refresh-token), Google Cloud-project `mokum-streams`
- Owner GitHub: peterdeswart96-ship-it
- Productie: mokum-streams.pdscloud.nl (via GitHub Pages)

## Stack (monorepo)
- `frontend/` — React + Vite + Tailwind CSS v3, gehost via GitHub Pages
- `backend/` — Azure Functions (Node.js), timer-trigger + HTTP-API
- `agent/` — Node.js Windows-service op streaming-pc (fase 2)
- `docs/` — projectplan, api-contract, ADR's
- `.github/workflows/` — deploy-prod.yml + deploy-test.yml (met path filters)

## Werkafspraken (harde regels)
1. **Taal:** antwoorden in het Nederlands. Commit messages Nederlands. Code-comments Nederlands.
2. **Branches:** develop = test, main = productie. NOOIT automatisch mergen naar main — dat besluit neemt Peter expliciet.
3. **API-contract:** wijzigingen aan koppelvlak frontend↔backend? Eerst `docs/api-contract.md` bijwerken (met datum + reden onderaan), dan pas code.
4. **Secrets:** OAuth-tokens, stream keys, publish profiles — NOOIT in code, repo, logging of chat. Altijd via GitHub Secrets of Azure app settings / Key Vault.
5. **PowerShell voorop:** shell-voorbeelden in PowerShell (Peter's dagelijkse shell). Bash alleen waar strikt nodig.
6. **Uitleg bij code:** Peter is geen developer maar wil beter worden. Geef bij nieuwe code korte uitleg wat het doet en waarom.
7. **Fasering:** fase 1 intake → fase 2 MVP één tafel → fase 3 dashboard/4 tafels → fase 4 live-pagina/monitoring. Geen werk uit latere fases naar voren halen zonder overleg.
8. **Live versie ophalen bij patchen:** bij het bewerken van een bestaand bestand altijd de LIVE versie ophalen via `raw.githubusercontent.com` — nooit een eerder gedownloade of gecachte versie als basis.
9. **Issues pas sluiten** nadat: workflow groen ÉN geslaagde test in de browser/functie-omgeving.

## Bekende beslissingen
- Authenticatie dashboard (fase 3): Entra External ID (zoals CV Optimizer)
- Website-integratie (fase 4): JS-widget via Boei17, geen iframe
- Video-id's komen uit eigen backend; kanaal-embed alleen als fallback
- Handmatige controle + noodstop gewenst → dashboardknoppen + **Stream Deck** (budget akkoord)
- Remote beheer OBS-pc: **Tailscale** (veilige netwerklaag, geen poorten open) + RustDesk/Chrome Remote Desktop voor het scherm. NB: klassieke Windows-RDP vergrendelt de console-sessie en kan OBS-capture/NVENC verstoren — kies een tool die de console spiegelt.

## Openstaand (na intake 2026-07-08)
- ~~Kanaalverificatie + livestreamen~~ ✅ bevestigd (2026-07-08): Feature eligibility niveau 1/2/3 allemaal "Enabled" — livestreamen mag, geen wachttijd. "Insluiten toestaan" per broadcast programmatisch zetten bij #9.
- Website-integratie (blok 6): apart uitvragen bij Sander (Boei17) — integratievorm, paginalocatie/menu, huisstijltokens, caching/CDN, SEO
- Exacte Cuescore-bron/mapping voor sponsors per tafel
- Retentiebeleid oude streams (nu handmatig verwijderen, later evt. automatiseren)
<!-- ===== WIKI-SCHEMA — PLAK NIET VERWIJDEREN ===== -->

## Projectwiki (kennisbank)

Dit project heeft een door de LLM onderhouden wiki in `wiki/`. De wiki is het
langetermijngeheugen van het project: besluiten, architectuur, conventies,
actuele status en geleerde lessen.

**Kernregel: raadpleeg ALTIJD `wiki/` voordat je vragen beantwoordt over de
architectuur, patronen, besluiten of geschiedenis van dit project. Lees eerst
`wiki/index.md` om te zien welke pagina's er zijn, en open daarna de relevante
pagina's. Raadpleeg ook altijd `wiki/api-contract.md` bij vragen over de
API-afspraken tussen frontend- en backend-sessie.**

Zie `wiki/index.md` voor de volledige catalogus en `CLAUDE.md` in de
wiki-root voor de volledige spelregels.

<!-- ===== EINDE WIKI-SCHEMA ===== -->
