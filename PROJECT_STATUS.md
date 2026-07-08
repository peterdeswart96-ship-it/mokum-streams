# Mokum Streams — Project Status

> Bijgewerkt op: 08-07-2026 19:20
> Repo: https://github.com/peterdeswart96-ship-it/mokum-streams

## Over dit project

Automatisering YouTube-livestreams Mokum Pool & Darts (4 cameratafels: 1, 3, 15, 16).

## Fase

Fase 1 (intake & ontwerp) afgerond → **fase 2 (MVP) in volle gang**. De
backend-fundering staat: YouTube-wrapper, Cuescore-lees, planning-model v2
(import → planning.json → broadcasts) en admin-endpoints. Alles op `develop`,
CI groen (42 unit-tests).

## Deployment Status

- **develop** — laatste: `a9d6297` admin-endpoints voor het dashboard (08-07-2026)
- Backend-deploy naar Azure: **placeholder** — Function App bestaat nog niet (volgende infra-stap)
- Frontend: nog geen skeleton (#12)

## Gesloten deze sessie (08-07)

- **#5** Google Cloud-project (YouTube Data API v3)
- **#6** OAuth-koppeling — app in productie, refresh-token in Key Vault `kv-mokum-streams`
- **#7** Backend map-skeleton (Azure Functions v4)
- **#15** Cuescore-lees module (optie B) — live geverifieerd

## Open Issues

**Totaal open: 5 issues**

### 🔴 Hoge prioriteit — code klaar, open tot echte run

- **#8** YouTube API-wrapper (liveBroadcasts + liveStreams) — code + tests klaar; echte API-call tegen kanaal nog te doen
- **#9** Broadcast-Function op basis van planning — code + tests klaar; echte run met streamID-seed nog te doen
- **#11** End-to-end test: geplande stream gaat automatisch live en stopt

### 🟡 Normale prioriteit

- **#10** OBS-agent skeleton — code + tests klaar; tegen echte OBS draaien + Windows-service
- **#12** Frontend map-skeleton (React + Vite + Tailwind)

## Recente Commits (develop)

- `a9d6297` feat: admin-endpoints voor het dashboard (planning + defaults + config)
- `390acc6` feat: #9 leest nu planning.json i.p.v. schedule.json (planning-model v2)
- `cb713a7` docs: API-contract v0.5 — type + camera-toewijzing + doorlopende events
- `7af5d5e` feat: Cuescore-import + planning-store (planning-model v2, deel 1)
- `1e00950` feat: OBS-agent skeleton met obs-websocket + overlay-toggles (#10)
- `f0fbcdd` feat: broadcast-Function (timer) op basis van schema (#9)

## Belangrijkste openstaande punten

- **Ad-hoc streams + agent-commandowachtrij** (`/api/admin/streams/start` → `/api/agent/commands`)
- **Per-avond-logica voor competities** (leagues zijn doorlopende Cuescore-tournaments — zie wiki/gaps.md #14/#16)
- **Echte run**: Azure Function App + storage aanmaken, streamID's seeden in `config/tables.json`
- **Dashboard (#12)** + live-pagina (fase 3/4)

## Openstaand richting derden

- Sander (Boei17): website-integratie-blok uitvragen (fase 4)
- Nick: OBS-mappen staan in OneDrive — verplaatsen aanraden (wiki/gaps.md #9)
- Cuescore-link naar een teamcompetitie ontvangen (voorbeeld: leagues/?c=1000231)

## Claude Project Sync

Upload na deze sessie naar het Claude project:

- [ ] `PROJECT_STATUS.md` (dit bestand)
- [ ] `docs/api-contract.md` (v0.5)
- [ ] `docs/sessies/2026-07-08-handover.md`
- [ ] Aangepaste backend-/agent-bestanden (zie recente commits)
