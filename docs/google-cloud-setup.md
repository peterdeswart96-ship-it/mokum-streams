# Google Cloud-setup — Mokum Streams

Documentatie van de Google Cloud- en OAuth-configuratie die de YouTube Live
Streaming API voor dit project ontsluit. Bedoeld als naslag voor toekomstige
sessies: wat bestaat er, waar staan de secrets (verwijzing, geen waarden) en
wat is de volgende stap.

Zie `docs/projectplan.md` §3.2 (YouTube Live Streaming API — waarom een Google
Cloud-project nodig is als "sleutelkast" voor de credentials) en §3.4
(beveiliging — waarom tokens en keys nooit in code of repo staan).

Status: **issue #5 én #6 afgerond** (bijgewerkt 2026-07-08). Google Cloud-project,
YouTube Data API v3, OAuth-consentscherm op **In production**, en een geldig
refresh-token via het eigenaaraccount `pooleninmokum@gmail.com` — opgeslagen in
Azure Key Vault `kv-mokum-streams`. Volgende stap: fase 2 (backend-skeleton #7).

## Wat is aangemaakt

- **Google Cloud-project:** `mokum-streams`. Dient uitsluitend als houder van de
  API-credentials; er draait geen infrastructuur in Google Cloud. De applicatie
  zelf draait op Azure (zie projectplan §3.3).
- **API ingeschakeld:** YouTube Data API v3. Dit is de API waarmee we
  liveStreams (vaste stream keys) en liveBroadcasts (uitzendingen) beheren.
- **OAuth-consentscherm:** naam "Mokum Streams Automation", User type
  **External**, publishing status **In production** (was Testing; omgezet bij #6
  zodat het refresh-token niet na ~7 dagen verloopt).
- **Scopes:** `youtube` en `youtube.readonly`.
- **OAuth-flow doorlopen met:** het eigenaaraccount `pooleninmokum@gmail.com`
  (het kanaal-account). Hiermee is het refresh-token opgehaald.
- **OAuth-client:** desktop-client met naam `mokum-streams-desktop-client`
  (type Desktop app — gebruikt voor de eenmalige lokale OAuth-flow die het
  refresh-token opleverde).

## Waar staan de secrets

Alle credentials staan **buiten de repository** in:

```
C:\Projects\mokum-streams-secrets\
```

Deze map is bewust géén onderdeel van de git-repo. Client-ID, client-secret en
het refresh-token worden hier lokaal bewaard. Conform projectplan §3.4
en CLAUDE.md-regel 4 staan er **nooit** credentialwaarden in code, repo, logging
of chat.

**Voor productie (afgerond bij #6):** de secrets staan in Azure Key Vault
**`kv-mokum-streams`** (resource group `rg-mokum-streams`), als secrets
`youtube-client-id`, `youtube-client-secret` en `youtube-refresh-token`. De
Azure Functions-backend leest ze straks daaruit (managed identity / app
settings-referentie).

> Let op: dit document bevat bewust geen client-ID, client-secret of tokens —
> alleen de verwijzing naar de map hierboven.

## Publishing status en gevolgen

De app staat op **In production**. Gevolgen:

- Elk Google-account kan de OAuth-flow doorlopen; geen test-userlijst meer nodig.
- Het refresh-token verloopt **niet** meer na ~7 dagen (dat was het Testing-
  probleem), dus de geautomatiseerde koppeling blijft stabiel werken.

## OAuth-koppeling — afgerond (issue #6)

Uitgevoerd op 2026-07-08:

1. ✅ Eenmalige OAuth-flow doorlopen met `pooleninmokum@gmail.com` → **refresh-token** verkregen.
2. ✅ Refresh-token opgeslagen in Key Vault `kv-mokum-streams` (zie "Waar staan de secrets").
3. ✅ Testcall bevestigde toegang tot kanaal `UCXb_CDaEhEO8CImYTvHalTw`.
4. ⚠️ **Nog te doen vóór de end-to-end test (#11):** in YouTube Studio
   controleren of het kanaal **geverifieerd** is (telefoon) en of **"insluiten
   van livestreams"** aanstaat — beide vereist voor livestreamen/embedden, kan
   tot 24u duren (projectplan §7). Bij de intake was dit nog "weet ik niet".

## Aandachtspunten

- **Scope-wijziging = opnieuw toestemmen:** breiden we de scopes later uit (bijv.
  voor schrijfacties op broadcasts), dan is een nieuwe OAuth-toestemming nodig.
- **Google Cloud vs. hosting:** het project draait niets in Google Cloud; het is
  puur de credential-houder. De runtime blijft Azure (projectplan §3.3).

## Wijzigingslog

- 2026-07-04: eerste versie — Google Cloud-project, YouTube Data API v3,
  OAuth-consentscherm (Testing) en desktop-client gedocumenteerd (issue #5).
- 2026-07-08: OAuth-koppeling afgerond (#6) — app op In production, refresh-token
  via `pooleninmokum@gmail.com` in Key Vault `kv-mokum-streams`. Kanaalverificatie/
  embed-instelling nog te controleren.
