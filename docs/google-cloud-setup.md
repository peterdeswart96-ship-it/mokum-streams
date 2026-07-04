# Google Cloud-setup — Mokum Streams

Documentatie van de Google Cloud- en OAuth-configuratie die de YouTube Live
Streaming API voor dit project ontsluit. Bedoeld als naslag voor toekomstige
sessies: wat bestaat er, waar staan de secrets (verwijzing, geen waarden) en
wat is de volgende stap.

Zie `docs/projectplan.md` §3.2 (YouTube Live Streaming API — waarom een Google
Cloud-project nodig is als "sleutelkast" voor de credentials) en §3.4
(beveiliging — waarom tokens en keys nooit in code of repo staan).

Status: afgerond voor issue #5. Volgende stap: issue #6 (OAuth-koppeling +
refresh-token).

## Wat is aangemaakt

- **Google Cloud-project:** `mokum-streams`. Dient uitsluitend als houder van de
  API-credentials; er draait geen infrastructuur in Google Cloud. De applicatie
  zelf draait op Azure (zie projectplan §3.3).
- **API ingeschakeld:** YouTube Data API v3. Dit is de API waarmee we
  liveStreams (vaste stream keys) en liveBroadcasts (uitzendingen) beheren.
- **OAuth-consentscherm:** naam "Mokum Streams Automation", User type
  **External**, publishing status **Testing**.
- **Scopes:** `youtube` en `youtube.readonly`.
- **Test user:** peterdeswart96@gmail.com (in Testing-modus mag alleen een
  geregistreerde test-user inloggen; zie "Aandachtspunten").
- **OAuth-client:** desktop-client met naam `mokum-streams-desktop-client`
  (type Desktop app — geschikt voor de eenmalige lokale OAuth-flow waarmee we in
  issue #6 een refresh-token ophalen).

## Waar staan de secrets

Alle credentials staan **buiten de repository** in:

```
C:\Projects\mokum-streams-secrets\
```

Deze map is bewust géén onderdeel van de git-repo. Client-ID, client-secret en
(straks) het refresh-token worden hier lokaal bewaard. Conform projectplan §3.4
en CLAUDE.md-regel 4 staan er **nooit** credentialwaarden in code, repo, logging
of chat. Voor productie verhuizen de secrets naar Azure (Key Vault of
versleutelde app settings).

> Let op: dit document bevat bewust geen client-ID, client-secret of tokens —
> alleen de verwijzing naar de map hierboven.

## Publishing status en gevolgen

De app staat op **Testing** (niet "In production"). Gevolgen:

- Alleen geregistreerde test-users kunnen de OAuth-flow doorlopen.
- Refresh-tokens in Testing-modus kunnen na circa 7 dagen verlopen. Zolang we in
  Testing zitten is dat een aandachtspunt voor de koppeling; bij structureel
  gebruik zetten we de app op "In production" (eventueel met verificatie) zodat
  het refresh-token stabiel blijft. Besluit hoort bij issue #6 / fase 2.

## Volgende stap — issue #6

Met deze credentials kan de OAuth-koppeling worden opgezet:

1. Eenmalige OAuth-flow doorlopen met het Mokum-Google-account en de scopes
   hierboven, om een **refresh-token** te verkrijgen.
2. Refresh-token versleuteld opslaan (lokaal in de secrets-map, later in Azure).
3. Testcall: kanaalgegevens van UCXb_CDaEhEO8CImYTvHalTw ophalen ter bevestiging.
4. Kanaalverificatie en "insluiten van livestreams" controleren (projectplan §7).

Details en acceptatiecriteria: zie issue #6 (OAuth-koppeling opzetten met
YouTube-kanaal van Mokum).

## Aandachtspunten

- **Test-user vereist in Testing-modus:** wil een ander Google-account de flow
  doorlopen, dan moet dat eerst als test-user worden toegevoegd in het
  consentscherm.
- **Scope-wijziging = opnieuw toestemmen:** breiden we de scopes later uit (bijv.
  voor schrijfacties op broadcasts), dan is een nieuwe OAuth-toestemming nodig.
- **Google Cloud vs. hosting:** het project draait niets in Google Cloud; het is
  puur de credential-houder. De runtime blijft Azure (projectplan §3.3).

## Wijzigingslog

- 2026-07-04: eerste versie — Google Cloud-project, YouTube Data API v3,
  OAuth-consentscherm (Testing) en desktop-client gedocumenteerd (issue #5).
