# Plan — Website-groei: Analytics + SEO (#18)

> Gefaseerd plan voor issue #18. Doel: **meetbaar** meer verkeer naar de
> Mokum-website en betere vindbaarheid, met de groeicijfers zichtbaar in het
> **centrale mokum-bot-dashboard** (`https://mokum-bot.pdscloud.nl/dashboard.html`).
>
> Twee sporen lopen door elkaar: **meten** (Analytics) en **vindbaar worden** (SEO).
> Sommige stappen kunnen wij zelf (mokum-streams-repo), andere hebben **Boei17
> (Sander)** nodig omdat hij de hoofd-website beheert.

## Kaders & aannames
- **Eigenaarschap:** de hoofd-website is van Boei17. Onze eigen pagina's
  (`/standen`, later de live-widget) en de YouTube-broadcasts beheren we zelf.
- **Privacy (AVG):** op **onze eigen** `/standen`-pagina gebruiken we een
  **cookieloze** teller (geen persoonsgegevens, geen consent-banner). GA4 op de
  hoofdsite valt onder Sanders cookie-/consentbeleid.
- **Repo-splitsing:** meten + tags + SEO-hooks bouwen we in **mokum-streams**;
  het samenbrengen op het **centrale dashboard** gebeurt in **mokum-bot**.
- **Afhankelijkheid Boei17:** blok 6 uit `CLAUDE.md` (integratievorm, menu,
  huisstijl, caching/CDN) is nog open — dit plan vraagt dat mee uit.

---

## Fase 0 — Nulmeting & toegang  *(blokkeert de rest; vergt Boei17)*
Zonder baseline kunnen we later geen verbetering aantonen.
- [ ] Checken of er al **GA4** op de Mokum-site staat. Zo ja → **leestoegang** tot
      de GA4-property regelen. Zo nee → Boei17 laat GA4 toevoegen.
- [ ] **Baseline vastleggen** (bezoekers, bronnen, top-pagina's) — export/screenshot
      met datum, zodat "voor/na" hard te maken is.
- [ ] Bij Sander uitvragen (blok 6): waar/hoe integreren, menu-plek, huisstijltokens,
      caching/CDN, en of hij **Google Search Console** al heeft.
- **Klaar als:** we baseline-cijfers hebben + weten wat Sander al heeft staan.

## Fase 1 — Meten wat wij zélf besturen  *(mokum-streams; geen Boei17 nodig)*
Quick wins die volledig binnen ons bereik liggen.
- [ ] **UTM-tags** op alle uitgaande links vanuit streams/QR, bv.
      `?utm_source=stream&utm_medium=qr&utm_campaign=standen`. Dan schrijft GA het
      verkeer toe aan de streams.
- [ ] **Cookieloze teller op `/standen`**: QR-scans + paginaweergaves, per bron.
      - *Aanpak (aanbevolen):* klein endpoint in onze Azure Functions
        (`POST /api/hit` → opgeteld in blob-opslag), front-end pingt bij laden.
        Geen cookies, geen persoonsgegevens → geen consent-banner.
      - *Alternatief:* self-hosted Plausible/Umami (meer beheer, wél mooie UI).
- **Klaar als:** we in cijfers zien hoeveel QR-scans en `/standen`-bezoeken er zijn.

## Fase 2 — SEO-fundament  *(deels wij, deels Boei17)*
- [ ] **Google Search Console** koppelen (Sander verifieert het domein; wij krijgen
      toegang) → zoekwoorden + indexatiestatus.
- [ ] **Meta titles/descriptions** + **gestructureerde data** (schema.org
      `Event`/`BroadcastEvent`) op `/standen` en relevante sitepagina's → rich results
      voor toernooien/uitzendingen.
- [ ] **Sitemap.xml + robots.txt** kloppend (met Sander voor de hoofdsite).
- [ ] **Content & zoekwoorden** met Sander: "poolen Amsterdam", "pooltoernooi live",
      "9-ball live", "darts Amsterdam".
- **Klaar als:** `/standen` (en sleutelpagina's) geïndexeerd zijn en Search Console
      data levert.

## Fase 3 — Verkeer aanjagen  *(veel hiervan besturen wij)*
- [ ] **YouTube-videobeschrijvingen automatisch vullen** met een link naar
      `/standen` + de site. *Laaghangend fruit:* `createBroadcast` heeft al een
      `description`-veld (nu leeg) — daar kunnen we de link + UTM in zetten bij het
      aanmaken van elke broadcast.
- [ ] **Cross-linking:** Cuescore venue-pagina, social, en een **Google Business
      Profile** voor de zaal (Sander/zaal).
- [ ] **Live-widget/embed** op de site (fase 4 van het hoofdproject) als
      verkeer-drijver.
- **Klaar als:** in GA aantoonbaar verkeer binnenkomt via `utm_source=stream`/YouTube.

## Fase 4 — Cijfers op het centrale dashboard  *(mokum-bot-repo)*
Alles samenbrengen op `mokum-bot.pdscloud.nl/dashboard.html`.
- [ ] **Paneel "Website-groei"** met: `/standen`-bezoek + QR-scans (uit onze teller
      uit fase 1), **GA4-hoogtepunten** (GA4 Data API) en **Search Console-hoogtepunten**
      (Search Console API).
- [ ] **Credentials:** Google **service-account** (read-only) in Key Vault; GA4 Data
      API + Search Console API aanzetten in het Google Cloud-project.
- [ ] **Backend:** kleine functie die dagelijks de API's uitleest en samenvat (caching,
      quota-vriendelijk), zodat het dashboard alleen onze samenvatting hoeft te tonen.
- **Klaar als:** één centrale plek de groeicijfers toont (bezoek, bronnen, top-zoekwoorden,
      QR-scans).

---

## Volgorde & afhankelijkheden
1. **Fase 0** eerst (baseline + toegang) — blokkeert 2 en 4.
2. **Fase 1 & 3** kunnen parallel en direct (wij besturen ze zelf).
3. **Fase 2** zodra Search Console er is.
4. **Fase 4** als er data ís om te tonen (na 1/2/3) — en gebeurt in **mokum-bot**.

## Wat Boei17 (Sander) moet leveren
- GA4-toegang (of GA4 toevoegen), Search Console-verificatie, plek/menu op de site,
  huisstijltokens, akkoord op meta/gestructureerde data, en (zaal) Google Business Profile.

## Aandachtspunten
- **AVG/consent:** onze eigen teller cookieloos houden; GA4 valt onder Sanders
  consentbeleid.
- **Google API-quota:** GA4 Data API + Search Console API hebben daglimieten →
  server-side samenvatten en cachen (fase 4), niet live vanuit de browser.
- **Attributie:** consequent dezelfde UTM-conventie gebruiken (fase 1) anders is het
  verkeer in fase 4 niet betrouwbaar toe te wijzen.
