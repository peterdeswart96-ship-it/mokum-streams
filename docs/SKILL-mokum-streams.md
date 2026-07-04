---
name: mokum-streams
description: Referentie en werkwijze voor het Mokum Streams-project (automatisering YouTube-livestreams Mokum Pool & Darts). Gebruik deze skill bij elke werksessie aan dit project - bij het bouwen van de backend (Azure Functions, YouTube Live Streaming API), de frontend (dashboard, live-pagina, widget), de OBS-agent, of bij deploy-vragen. Trigger bij: "mokum streams", "livestream automatisering", "youtube broadcast", "obs agent", "live-pagina", "streamschema", of werk aan de repo mokum-streams.
---

# Mokum Streams — projectreferentie

## Doel
Volledig geautomatiseerde YouTube-livestreams voor 4 cameratafels bij Mokum Pool & Darts: inplannen op vaste tijden, automatisch live en automatisch stoppen, beheer op afstand, streams zichtbaar op poolen-amsterdam.nl.

## Architectuur in het kort
Zaal: streaming-pc met OBS Studio (obs-websocket, poort 4455, alleen lokaal) + lokale Node.js agent (Windows-service, alleen uitgaande HTTPS).
Cloud (Azure): Functions (Node.js) met timer-trigger (broadcasts aanmaken) en HTTP-API (dashboard/live-pagina); Table/Blob Storage voor schema en ids; secrets in app settings/Key Vault.
YouTube: herbruikbare liveStream (vaste stream key) per tafel; per uitzending een broadcast via liveBroadcasts.insert met enableAutoStart/enableAutoStop, gekoppeld via liveBroadcasts.bind. Google Cloud-project alleen als credential-store (OAuth van het Mokum-kanaal).
Frontend: React/Vite/Tailwind op GitHub Pages — beheer-dashboard (login) + publieke live-pagina + embeddable widget voor Boei17.

## Kernconventies
- Titeltemplate: Tafel {nr} ‘{sponsor}’ {toernooinaam}
- Tafelconfiguratie (nummer, sponsor, stream key) leeft op EEN plek in de backend; frontend haalt dit via de API op. Nooit dupliceren in widget-code (les van mokum-bot issue #73).
- Video-ids komen altijd uit de eigen backend (wij maken de broadcasts, dus wij kennen de ids). Channel-embed (youtube.com/embed/live_stream?channel=UCXb_CDaEhEO8CImYTvHalTw) alleen als fallback; RSS-feed alleen voor "Terugkijken".
- API-contract tussen frontend en backend staat in docs/api-contract.md — eerst contract wijzigen, dan code.

## Werkwijze (harde regels)
1. Branch-strategie: develop = test, main = productie. NOOIT automatisch naar main mergen - alleen na expliciet akkoord van Peter (zie mokum-deploy skill).
2. Voor het patchen van bestanden: altijd de LIVE versie ophalen via raw.githubusercontent.com, nooit een eerder gedownloade versie als basis gebruiken.
3. GitHub Issues pas sluiten na: groene workflow EN geslaagde test in de browser/functie-omgeving.
4. Secrets nooit in code, repo, logging of chat.
5. Sessie-einde: gewijzigde referentiebestanden (deze SKILL.md, projectplan, api-contract.md) opnieuw uploaden naar het Claude Project "Mokum Streams".

## Fasering (bouw niet vooruit)
1. Intake/ontwerp: vragenlijst Nick & Mark + Sander, OAuth-koppeling, definitief ontwerp
2. MVP: één tafel end-to-end automatisch (broadcast aanmaken -> agent start OBS -> autoStart -> autoStop)
3. Dashboard + uitrol 4 tafels + Cuescore-titels + Stream Deck
4. Live-pagina/widget via Boei17, monitoring, documentatie personeel

## Openstaande beslissingen (check intake-antwoorden in projectkennis)
- Welke tafelnummers hebben cameras + sponsornamen per tafel (vraag 1b)
- Eén pc of meerdere; gelijktijdige streams en uploadcapaciteit (vraag 1, 3)
- Toegang Google-account / kanaalverificatie (vraag 5, 6)
- Integratievorm website met Sander (vragen 16-21; advies: JS-widget)
