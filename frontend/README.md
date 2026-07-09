# frontend — Mokum Streams (dashboard)

Beheer-dashboard (React + Vite + **Tailwind CSS v3**), gehost via GitHub Pages.
Leunt op de admin-endpoints van de backend (`/api/manage/planning`, zie
[`../docs/api-contract.md`](../docs/api-contract.md)).

## Status
**Skeleton** (issue #12): een werkend planning-overzicht met filters en per
toernooi schakelaars voor **streamen**, **camera's** (1/3/15/16) en **overlays**
(sponsors/scorebord). Wijzigingen gaan via `POST /api/manage/planning/{id}`.
Nog te doen: auth (Entra External ID), ad-hoc start/stop-knoppen, live-status.

## Mapstructuur
```
frontend/
├─ index.html
├─ vite.config.js / tailwind.config.js / postcss.config.js
└─ src/
   ├─ main.jsx            # entrypoint
   ├─ index.css           # Tailwind-directives
   ├─ api.js              # fetch-helpers (VITE_API_BASE)
   ├─ App.jsx             # dashboard-shell + filters
   └─ components/
      └─ PlanningRow.jsx  # één toernooi/competitie-rij
```

## Lokaal draaien
Vereist **Node.js 20**.
```powershell
npm ci
# backend-URL (Function App) instellen; leeg = zelfde host
$env:VITE_API_BASE = "http://localhost:7071"
npm run dev
```
Build: `npm run build` → `dist/` (dat de CI naar GitHub Pages publiceert).

## Deploy
Via `.github/workflows/deploy-prod.yml` (main) → GitHub Pages. `base` in
`vite.config.js` staat op `/` (custom domain mokum-streams.pdscloud.nl).
