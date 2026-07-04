# Automatisering Livestreams — Mokum Pool & Darts

Projectplan: van handmatig streamen naar volledig geautomatiseerde YouTube-livestreams met planning, dashboard en live-pagina op de website.

Versie 0.3 (concept) — juli 2026
Opgesteld door: Peter de Swart
Voor: Nick & Mark — Mokum Pool & Darts, Nobelweg 2, Amsterdam

## 1. Samenvatting

Mokum Pool & Darts heeft vier tafels met cameras en een werkende OBS/YouTube-streamingopstelling. Het starten van een stream is nu volledig handmatig en te ingewikkeld voor het personeel: OBS moet bediend worden én in YouTube Studio moet per uitzending van alles worden aangeklikt.

**Het doel van dit project:** streams volledig automatiseren. Wekelijkse toernooien worden één keer ingepland (dag, tijd, naam) en gaan daarna vanzelf live — zonder dat iemand iets hoeft te doen. De streams verschijnen automatisch op de website van Mokum (poolen-amsterdam.nl), wat meer bezoekers en zichtbaarheid oplevert. De plaatsing op de website gebeurt in samenwerking met Boei17 (Sander), de bouwer van de WordPress-site — dezelfde beproefde aanpak als bij de bestaande Mokum-chatbot. Alles is op afstand te beheren via een eenvoudig dashboard, en voor noodgevallen komt er een fysieke knop (Stream Deck) in de zaal.

**Kosten:** de software (OBS, YouTube) is gratis. De cloudkosten zijn naar verwachting € 0 tot € 10 per maand. Eenmalige hardware (Stream Deck) kost circa € 60 tot € 150. Zie hoofdstuk 6 voor de volledige kostenindicatie.

**Wat is er nodig om te starten:** antwoorden op de vragenlijst in hoofdstuk 4 — vooral toegang tot het YouTube-account en inzicht in de huidige technische opstelling (hoofdstuk 4, vraag 1 en 5 zijn bepalend).

## 2. Deel A — Het plan in gewone taal (voor Nick & Mark)

### 2.1 De situatie nu

Elke keer als er gestreamd moet worden, moet iemand achter de streaming-computer kruipen: OBS opstarten, de juiste instellingen controleren, in YouTube Studio een uitzending aanmaken of bevestigen, een titel intypen, en op het juiste moment op de juiste knoppen drukken. Gaat er iets mis, dan staat de stream niet online of blijft hij hangen. Dat is foutgevoelig, kost tijd en is voor het personeel te ingewikkeld.

### 2.2 Wat gaan we bouwen?

Het project bestaat uit drie onderdelen die samen één systeem vormen:

1. **Automatische planning.** Wekelijkse toernooien worden één keer vastgelegd: "Elke dinsdag 19:30 — Dinsdagavond Toernooi — Tafel 1 en 2". Het systeem maakt daarna elke week vanzelf de YouTube-uitzendingen aan, met de juiste naam, omschrijving en starttijd, en start en stopt de stream automatisch op het geplande tijdstip.

2. **Een simpel dashboard.** Een webpagina (op telefoon, tablet of pc) waarop je in één oogopslag ziet: welke tafels streamen er nu, wat staat er gepland, en grote knoppen voor "start" en "stop" als je toch handmatig wilt ingrijpen. Voor in de zaal komt er optioneel een Stream Deck: een kastje met fysieke knoppen waarmee het personeel met één druk een stream kan starten of stoppen — zonder computerkennis.

3. **Een live-pagina op de website.** Bezoekers van de website zien de livestreams van alle tafels direct op de site van Mokum, met daarbij welk toernooi er bezig is en het schema van komende uitzendingen. Kijkers hoeven dus niet meer zelf op YouTube te zoeken — dat betekent meer bezoekers op de eigen website en meer zichtbaarheid voor de zaak.

### 2.3 Hoe ziet een toernooiavond er straks uit?

Een dinsdagavond met het wekelijkse toernooi:

- Niemand hoeft iets te doen. Om 19:15 maakt het systeem de YouTube-uitzendingen klaar (naam, omschrijving, tijd staan er automatisch goed in).
- Om 19:30 start de stream vanzelf. YouTube gaat automatisch live zodra er beeld binnenkomt.
- Op de website verschijnt de stream automatisch op de live-pagina, met de toernooinaam erbij.
- Na afloop stopt de stream vanzelf en blijft de opname op YouTube staan, zodat spelers hun partijen kunnen terugkijken.
- Gaat er iets mis of moet er tussentijds gestopt worden? Eén druk op de knop van het Stream Deck in de zaal, of één tik in het dashboard op de telefoon.

### 2.4 Wat levert het op?

- Geen gedoe meer: personeel hoeft niets meer te weten van OBS of YouTube Studio.
- Betrouwbaarheid: streams starten altijd op tijd, met de juiste naam en instellingen.
- Meer websitebezoekers: kijkers komen naar de site van Mokum in plaats van naar YouTube.
- Promotie: het schema van komende streams staat zichtbaar op de site — gratis reclame voor de toernooien.
- Archief: alle wedstrijden blijven terug te kijken (goed voor spelers én voor nieuwe bezoekers).

### 2.5 Wat hebben we van jullie nodig?

- Toegang tot het Google-/YouTube-account van Mokum (nodig om de automatische koppeling te maken).
- Antwoorden op de vragenlijst in hoofdstuk 4 (kost circa 30 minuten, kan samen in één gesprek).
- Een moment om samen bij de streaming-computer te kijken hoe de huidige opstelling in elkaar zit.
- Akkoord op de kleine kostenposten (hoofdstuk 6).
- Twee praktische zaken regelen: bordjes "hier wordt gefilmd" in de zaal (privacywetgeving) en een besluit over muziek die hoorbaar is op de stream (auteursrecht op YouTube, zie hoofdstuk 7).

## 3. Deel B — Technische architectuur

### 3.1 Overzicht

Het systeem bestaat uit een lokaal deel (in de zaal) en een clouddeel (Azure). De kern van de automatisering zit in twee koppelingen: de obs-websocket-interface om OBS aan te sturen, en de YouTube Live Streaming API om uitzendingen programmatisch aan te maken en te beheren.

Architectuur op hoofdlijnen:

- Zaal: 4 tafels met cameras, streaming-pc met OBS Studio (obs-websocket poort 4455, alleen lokaal), lokale agent (Node.js Windows-service), optioneel Stream Deck.
- Uitgaande HTTPS-verbinding naar Azure.
- Azure: Functions (Node.js) — timer voor broadcasts aanmaken/plannen, HTTP-API voor dashboard/live-pagina. Table/Blob Storage voor schema en ids. Koppeling met YouTube Live Streaming API.
- Publiek: beheer-dashboard (React, alleen beheerders) en live-pagina op de website (embedded YouTube-players + schema).

### 3.2 De componenten

**OBS Studio + obs-websocket**

OBS Studio 28+ heeft de WebSocket-besturingsinterface standaard ingebouwd (poort 4455, met wachtwoordauthenticatie). Hiermee kan een extern programma OBS volledig aansturen: streams starten en stoppen, scènes wisselen, bronnen beheren en statusinformatie uitlezen. Voor dit project gebruiken we vooral StartStream/StopStream en statusmonitoring. De websocket-poort wordt nooit rechtstreeks opengezet naar internet (zie 3.4).

**YouTube Live Streaming API — de sleutel tot automatisering**

Het handmatige werk in YouTube Studio vervalt volledig door uitzendingen via de API aan te maken. Het patroon:

- Herbruikbare stream keys. Per tafel maken we één vaste liveStream-resource (vaste stream key) aan. OBS wordt eenmalig per tafel met die key geconfigureerd en hoeft daarna nooit meer aangepast te worden.
- Broadcast per uitzending. Voor elk toernooi maakt een Azure Function via liveBroadcasts.insert een nieuwe broadcast aan met titel, omschrijving en geplande starttijd, en koppelt die via liveBroadcasts.bind aan de vaste stream key van de juiste tafel.
- enableAutoStart / enableAutoStop. Met deze twee properties gaat de broadcast automatisch live zodra YouTube beeld ontvangt van OBS, en wordt hij automatisch afgesloten (circa één minuut) nadat OBS stopt met zenden. Niemand hoeft nog op "Go Live" te klikken.
- Bekende video-ids. Omdat ons systeem de broadcasts zelf aanmaakt, kennen we de video-ids. De live-pagina op de website krijgt die via onze eigen API — geen zoeken, geen verspilling van API-quotas, en het probleem dat embeds breken door wisselende video-ids is daarmee opgelost.

Let op: de YouTube API vereist een (gratis) Google Cloud-project voor de API-credentials en OAuth-toestemming van het YouTube-account van Mokum. Dit staat los van waar we hosten — de applicatie zelf draait gewoon op Azure. Het Google Cloud-project is puur de "sleutelkast" voor de YouTube-koppeling. Standaardquotum is 10.000 units per dag; een handvol broadcasts per week gebruikt daar een fractie van.

**Lokale agent**

Een kleine Node.js-service op de streaming-pc (draait als Windows-service, start automatisch op met de pc). De agent maakt een uitgaande, beveiligde verbinding met de Azure-backend (polling of persistente verbinding) en praat lokaal met obs-websocket. Zo kan de cloud commandos geven ("start stream tafel 3") zonder dat er ook maar één poort in de firewall van de zaal open hoeft. De agent rapporteert ook status terug: draait OBS, wordt er gestreamd, wat is de bitrate.

**Azure-backend**

- Azure Functions (Node.js, Consumption plan): timer-trigger die dagelijks het schema controleert en broadcasts aanmaakt; HTTP-endpoints voor het dashboard en de live-pagina.
- Azure Table Storage of Blob Storage: opslag van het streamschema, stream keys (versleuteld), broadcast-/video-ids en logging.
- Optioneel: koppeling met de bestaande Cuescore-integratie van de Mokum Bot, zodat toernooinamen en wedstrijdinfo automatisch in de broadcast-titel en op de live-pagina terechtkomen.

**Dashboard en live-pagina**

Beide in React/Vite/Tailwind, gehost via GitHub Pages (zelfde stack en CI/CD als het bestaande Mokum Bot-project). Het dashboard is afgeschermd (login) en biedt: schemabeheer, live status per tafel, handmatige start/stop en logging. De live-pagina is publiek en toont per tafel een embedded YouTube-player, de toernooinaam en het schema van komende streams. Voor de embeds gebruiken we de video-ids uit onze eigen backend; als fallback bestaat de permanente channel-embed (youtube.com/embed/live_stream?channel=KANAAL_ID). Als derde databron gebruiken we de gratis RSS-feed van het kanaal voor een "Terugkijken"-sectie met recente streams — zonder API-key of quotas. Let op: de channel-embed toont maar één stream tegelijk; bij 4 gelijktijdige streams zijn de video-ids uit de eigen backend dus noodzakelijk, en de RSS-feed bevat geen betrouwbare live-status.

**Stream Deck (optioneel maar aanbevolen)**

Een Elgato Stream Deck op de bar of bij de streaming-pc, met per tafel een start- en stopknop en een "alles stoppen"-noodknop. Het Stream Deck heeft een officiële OBS-plugin en werkt direct met de lokale OBS-installatie. Voor het personeel is dit de eenvoudigste denkbare bediening: één fysieke knop, geen schermen.

### 3.3 Cloudkeuze: Azure (voorkeur) vs. Google Cloud

Voorkeur: Azure. Alle bestaande projecten (Mokum Bot, CV Optimizer) draaien al op Azure Functions + Storage, de kennis en tooling zijn aanwezig, en de kosten zijn in het Consumption-model verwaarloosbaar. Google Cloud is alleen nodig als (gratis) credential-project voor de YouTube API; er hoeft daar niets te draaien. Volledig naar Google Cloud verhuizen biedt geen technisch voordeel en zou extra studie vergen — niet nodig.

### 3.4 Beveiliging

- obs-websocket blijft uitsluitend bereikbaar op het lokale netwerk, met authenticatie ingeschakeld; de poort wordt nooit geforward naar internet.
- De agent maakt alleen uitgaande HTTPS-verbindingen; er zijn geen inkomende poorten nodig in de zaal.
- OAuth-refresh-token van het YouTube-account en stream keys worden opgeslagen in Azure (Key Vault of versleutelde app settings), nooit in code of repository.
- Het dashboard krijgt authenticatie (bijv. Entra External ID, zoals bij CV Optimizer) en is alleen toegankelijk voor beheerders.
- Alternatief voor de agent-aanpak, mocht dat handiger blijken: Tailscale of Cloudflare Tunnel (beide gratis in dit gebruiksscenario).

### 3.5 Bevindingen uit verkenning van het YouTube-kanaal

Op basis van een lopende livestream en het kanaal zelf zijn de volgende feiten al vastgesteld (scheelt vragen in fase 1):

- Kanaal: @MokumPoolDarts, kanaal-ID UCXb_CDaEhEO8CImYTvHalTw. Het kanaal is volledig gewijd aan het streamen van pool- en dartwedstrijden — geen gemengde content.
- Titelconventie: streams volgen het patroon "Tafel {nr} 'sponsor' {toernooinaam}", bijvoorbeeld "Tafel 15 'GO Customs' Amsterdam Open Qualifier 1". Dit patroon wordt het template voor de geautomatiseerde broadcast-titels — herkenbaar voor kijkers, geen gedragsverandering nodig.
- Tafelnummering: de zaal telt aanzienlijk meer tafels (16 pooltafels) dan de 4 met camera; de gestreamde tafel was nummer 15. Het systeem moet dus de echte zaalnummering volgen. Zie de aangevulde vragenlijst (vraag 1b).
- Sponsorveld: tafels dragen kennelijk een sponsornaam (zoals GO Customs). Het configuratiemodel krijgt daarom per tafel: tafelnummer, sponsornaam en stream key. Sponsors verschijnen zo automatisch in elke streamtitel — extra sponsorwaarde voor Mokum.
- RSS-feed: het kanaal heeft een gratis RSS-feed die zonder API-key de recente streams levert — bruikbaar voor de "Terugkijken"-sectie en als eenvoudige healthcheck (verscheen de geplande stream in de feed?).

### 3.6 Integratie in de WordPress-website (samenwerking met Boei17)

De website poolen-amsterdam.nl is een WordPress-site met het Flatsome-thema, gebouwd en beheerd door Boei17 (Sander). De live-pagina wordt daarom in samenwerking met Boei17 toegevoegd. Er zijn drie integratieopties:

- **Optie A — JavaScript-widget (aanbevolen).** Peter levert één script-tag plus een div die Boei17 in een Flatsome UX Builder HTML-element op een nieuwe pagina /live plaatst. De widget haalt de live-status en video-ids op uit de Azure-backend en rendert de tafelkaarten, spelers en het schema in de huisstijl. Dit is exact hetzelfde patroon als de bestaande Mokum-chatbot op de site (widget.js), dus bekend terrein voor beide partijen. Voordeel: Boei17 plaatst één keer een snippet, alle inhoud en updates lopen daarna via Peters backend — geen WordPress-wijzigingen meer nodig bij nieuwe streams. Omdat de widget client-side data ophaalt, geeft caching (WordPress-cacheplugins) geen problemen met de live-status.
- **Optie B — iframe.** De complete live-pagina draait op mokum-bot.pdscloud.nl/live en wordt als iframe ingesloten. Simpelste plaatsing, maar minder mooi qua responsiviteit, SEO en huisstijl-integratie. Bruikbaar als snelle tussenstap.
- **Optie C — native in Flatsome.** Boei17 bouwt de pagina volledig in het thema; Peter levert alleen de JSON-API. Beste huisstijl-integratie, maar meer werk en onderhoud aan Boei17-zijde bij elke wijziging.

**Advies:** optie A. Verantwoordelijkheidsverdeling: Peter levert widget, API en documentatie en onderhoudt de functionaliteit; Boei17 plaatst de snippet, maakt de pagina en het menu-item aan en bewaakt de site-integratie. Een conceptontwerp in de huisstijl van de site (saliegroen, creme kaarten, koraalrood accent) is als demo beschikbaar en dient als visueel startpunt voor de afstemming met Sander.

## 4. Vragenlijst voor Nick & Mark

Deze vragen bepalen het definitieve ontwerp. Vraag 1 en 5 zijn bepalend voor de architectuur — zonder die antwoorden kan de bouw niet starten.

### 4.1 Huidige technische opstelling

1. Draaien de 4 tafels op één pc (met één of meerdere OBS-instanties) of op aparte pcs? Streamen ze naar 4 gelijktijdige YouTube-streams of één tegelijk?
1b. Welke tafelnummers hebben de cameras (de zaal telt 16 pooltafels; de stream toonde tafel 15)? Welke sponsornaam hoort bij elke tafel (zoals GO Customs)?
2. Welke OBS-versie draait er, wie heeft de setup gebouwd, en is er documentatie?
3. Wat is de upload-snelheid van het internet, en is de streaming-pc bekabeld aangesloten? (Circa 5 Mbps per 1080p-stream; 4 tegelijk vergt 20+ Mbps.)
4. Mag de streaming-pc 24/7 aan blijven staan (of automatisch aan via een tijdschema)?

### 4.2 YouTube-account

5. Wie beheert het Google-account van het YouTube-kanaal? Krijgt Peter (beheerders)toegang voor de API-koppeling?
6. Is het kanaal geverifieerd (telefoonnummer) en staat "insluiten van livestreams" aan? Is het kanaal gemonetiseerd?
7. Moeten oude streams als terugkijkvideo bewaard blijven, of na verloop van tijd verwijderd?

### 4.3 Wensen en werkwijze

8. Welke toernooien zijn wekelijks vast (dag + tijd + tafel(s))? Mag de toernooinaam automatisch uit Cuescore komen?
9. Wat moet het personeel op de avond zelf nog kunnen doen? Is een fysieke noodknop (Stream Deck) gewenst?
10. Wie krijgen toegang tot het dashboard, en willen jullie een melding (mail/app) als een stream mislukt?

### 4.4 Website en juridisch

11. Akkoord dat de live-pagina op poolen-amsterdam.nl/live komt (plaatsing door Boei17), met daarnaast een testversie op mokum-bot.pdscloud.nl?
12. Hangen er bordjes dat er gefilmd/gestreamd wordt, en staat streaming in het toernooireglement?
13. Is er muziek hoorbaar in de zaal die op de stream meekomt?

### 4.5 Budget en organisatie

14. Is er budget voor een Stream Deck (circa 60 tot 150 euro) en eventuele kleine hardware-upgrades als de pc 4 streams niet aankan?
15. Wie is het aanspreekpunt bij storingen tijdens een toernooiavond?

### 4.6 Vragen voor Sander (Boei17) — website-integratie

16. Voorkeur voor integratie: script-widget in een UX Builder HTML-element (zoals de chatbot), iframe, of native in Flatsome?
17. Waar komt de pagina: poolen-amsterdam.nl/live? Eigen menu-item "Live" of onder Agenda?
18. Welke exacte huisstijltokens gebruikt het thema (fontnamen, kleurcodes)? Kan Boei17 die delen zodat de widget pixel-perfect aansluit?
19. Welke caching (plugins/CDN) draait er op de site, en zijn YouTube-iframes en externe scripts toegestaan (beveiligings-/consentinstellingen)?
20. Wie plaatst en test de snippet, en wat is de doorlooptijd/kostenafspraak aan Boei17-zijde?
21. Zijn er SEO-wensen (bijv. schema.org-markup voor video/events) voor de live-pagina?

## 5. Fasering en actiepunten

De aanpak volgt vier fases. Per fase de actiepunten voor Peter en voor Nick & Mark, en het concrete resultaat waarmee de fase wordt afgesloten. Elke fase levert iets werkends op; er wordt pas doorgebouwd als de vorige fase bewezen werkt.

### Fase 1 — Intake en ontwerp (circa 1 tot 2 weken)

Peter: vragenlijst doornemen met Nick & Mark en huidige setup ter plekke bekijken en documenteren; integratie-aanpak en conceptontwerp afstemmen met Sander (Boei17); Google Cloud-project aanmaken voor YouTube API-credentials (gratis); OAuth-koppeling met het YouTube-account van Mokum opzetten en testen; definitief technisch ontwerp en planning vaststellen.

Nick & Mark: vragenlijst beantwoorden; toegang geven tot het Google-/YouTube-account; moment inplannen om samen de streaming-pc te bekijken; Boei17 informeren/opdracht geven voor de plaatsing op de website; akkoord op plan en kosten.

Resultaat: gedocumenteerde huidige situatie, werkende API-toegang, afspraken met Boei17 en een goedgekeurd definitief ontwerp.

### Fase 2 — MVP: één tafel volledig automatisch (circa 2 tot 3 weken)

Peter: vaste stream key (liveStream) aanmaken voor tafel 1 en OBS ermee configureren; Azure Function bouwen — broadcast aanmaken met titel, tijd, autoStart en autoStop; lokale agent bouwen en installeren (Windows-service) die OBS via websocket start/stopt; end-to-end test: geplande stream gaat live en stopt zonder één handmatige handeling.

Nick & Mark: streaming-pc beschikbaar houden voor tests; een testavond meedraaien en feedback geven.

Resultaat: bewijs dat de volledige keten werkt: één tafel streamt volautomatisch op een gepland tijdstip.

### Fase 3 — Dashboard en uitrol naar 4 tafels (circa 2 tot 3 weken)

Peter: beheer-dashboard bouwen (schemabeheer, status per tafel, handmatige start/stop, login); wekelijkse planning en Cuescore-koppeling voor toernooinamen inbouwen; uitrol naar alle 4 tafels; stream keys en OBS-profielen inrichten; optioneel Stream Deck configureren met start/stop-knoppen per tafel.

Nick & Mark: wekelijks toernooischema aanleveren; Stream Deck aanschaffen (indien gewenst); dashboard testen op telefoon en tablet.

Resultaat: alle tafels geautomatiseerd; beheer op afstand via dashboard; noodbediening in de zaal.

### Fase 4 — Live-pagina, monitoring en oplevering (circa 1 tot 2 weken)

Peter: live-widget bouwen (players per tafel, toernooinaam, schema komende streams) in de huisstijl van de site; widget, snippet en plaatsingsinstructie opleveren aan Boei17 en de plaatsing op poolen-amsterdam.nl/live begeleiden; monitoring en meldingen bij mislukte streams inrichten; documentatie en korte instructie (één A4) voor het personeel opleveren.

Nick & Mark: bordjes "hier wordt gefilmd" ophangen en reglement aanvullen (AVG); besluit nemen over muziek/audio op de stream; live-pagina promoten (social media, in de zaal); Boei17 plaatst snippet en menu-item.

Sander (Boei17): pagina en menu-item aanmaken, snippet plaatsen en samen met Peter testen.

Resultaat: streams zichtbaar op poolen-amsterdam.nl, systeem bewaakt zichzelf, personeel heeft een simpele handleiding.

## 6. Kostenindicatie

Alle bedragen zijn indicatief (inclusief btw, prijspeil medio 2026). De structurele kosten zijn zeer laag omdat YouTube al het videoverkeer gratis afhandelt en de Azure-onderdelen in het verbruiksmodel vrijwel niets kosten bij dit gebruiksvolume.

### 6.1 Eenmalige kosten

- Stream Deck (Elgato): 60 tot 150 euro. Mini (6 knoppen) circa 60, Neo (8 knoppen) circa 100, MK.2 (15 knoppen) circa 150. Voor 4 tafels met start/stop per tafel is de MK.2 de logische keuze.
- Bordjes "video-opnamen" (AVG): 10 tot 30 euro. Verplicht bij herkenbaar filmen van bezoekers.
- Eventuele pc-upgrade: p.m. Alleen als blijkt dat de huidige pc geen 4 gelijktijdige streams aankan (afhankelijk van antwoord op vraag 1). Richtprijs extra geheugen/GPU: 100 tot 400 euro.
- Software (OBS, agent, dashboard): 0 euro. OBS is gratis en open source; maatwerk wordt door Peter gebouwd.
- Boei17: plaatsing op de website: p.m. Aanmaken pagina /live + menu-item en plaatsen van de widget-snippet — beperkte klus; kostenafspraak met Sander (vraag 20).

### 6.2 Maandelijkse kosten

- Azure Functions (Consumption): 0 tot 5 euro. Gratis maandtegoed (1 miljoen uitvoeringen) dekt dit gebruik ruimschoots; realistisch 0 euro.
- Azure Storage (Table/Blob): minder dan 1 euro. Enkele megabytes aan schemas, ids en logs.
- Azure Key Vault (optioneel): 0 tot 1 euro. Voor veilige opslag van tokens en stream keys.
- YouTube Live + Live Streaming API: 0 euro. Gratis binnen het standaardquotum (10.000 units/dag); dit project gebruikt daar een fractie van. YouTube draagt alle streaming-/bandbreedtekosten richting kijkers.
- Google Cloud-project (credentials): 0 euro. Alleen als "sleutelkast" voor de YouTube API; er draait niets.
- Hosting dashboard/live-pagina: 0 euro. GitHub Pages, zoals de bestaande Mokum-projecten.
- **Totaal structureel: 0 tot 7 euro per maand.** Realistisch scenario: vrijwel 0 euro per maand.

Niet meegerekend: uren van Peter (nader af te spreken) en het bestaande internetabonnement van de zaal. Mocht de uploadcapaciteit onvoldoende blijken voor 4 gelijktijdige streams, dan is een upgrade van het internetabonnement een mogelijke extra maandelijkse post.

## 7. Risicos en aandachtspunten

- **Muziek in de zaal (auteursrecht).** Hoorbare achtergrondmuziek kan op YouTube leiden tot claims waardoor streams gedempt of geblokkeerd worden. Opties: streamen zonder audio, alleen een commentaar-/omgevingsmicrofoon gericht op de tafel, of rechtenvrije muziek. Besluit nodig in fase 1.
- **Privacy (AVG).** Spelers en publiek zijn herkenbaar in beeld. Nodig: duidelijke bordjes bij de ingang en de tafels, een bepaling in het toernooireglement, en terughoudendheid met close-ups van publiek.
- **Afhankelijkheid van YouTube.** YouTube kan een stream onderbreken bij (vermeende) schending van richtlijnen, en toont eigen branding en mogelijk advertenties in de embedded player. Voor dit gebruiksdoel (gratis, onbeperkt kijkersverkeer) is dat een acceptabele ruil.
- **Kanaalverificatie.** Livestreamen en het embedden van livestreams vereisen een geverifieerd kanaal; activatie kan tot 24 uur duren. Direct in fase 1 controleren en regelen.
- **Capaciteit streaming-pc en internet.** Vier gelijktijdige 1080p-streams vragen serieuze encodeercapaciteit en 20+ Mbps upload. De antwoorden op vraag 1 en 3 bepalen of dit een aandachtspunt is; desnoods starten we met minder gelijktijdige streams.
- **Continuiteit.** Afspraken nodig over beheer en support na oplevering (wie doet wat bij storingen, zie vraag 15).

## 8. Volgende stappen

- Nick & Mark: vragenlijst (hoofdstuk 4) doornemen — kan schriftelijk of in één gesprek van circa 30 minuten.
- Gezamenlijk moment plannen bij de streaming-pc om de huidige opstelling te bekijken.
- Toegang tot het Google-/YouTube-account regelen.
- Akkoord op de aanpak en kosten; daarna start fase 1.

Vragen of opmerkingen over dit plan? Neem contact op met Peter de Swart.
