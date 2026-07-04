# CLAUDE.md — Mokum Streams

Projectspecifieke instructies voor Claude Code werkend in deze repo.

## Wat dit project is
Automatisering van YouTube-livestreams voor Mokum Pool & Darts (Amsterdam). Opdrachtgevers: Nick & Mark. Website beheerd door Boei17 (Sander). Zie `docs/projectplan.md` voor het volledige ontwerp en `docs/SKILL-mokum-streams.md` voor de referentie op hoog niveau.

## Vaste feiten
- YouTube-kanaal: @MokumPoolDarts (UCXb_CDaEhEO8CImYTvHalTw)
- Titeltemplate broadcasts: `Tafel {nr} '{sponsor}' {toernooinaam}`
- 4 tafels met camera in een zaal van 16 pooltafels — echte zaalnummering aanhouden
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

## Openstaand (fase 1)
- Welke 4 tafelnummers hebben camera + sponsornamen per tafel
- Uploadcapaciteit + aantal gelijktijdige streams
- OAuth-toegang Google-account, kanaalverificatie
- Definitieve integratie-afspraken met Sander (Boei17)
