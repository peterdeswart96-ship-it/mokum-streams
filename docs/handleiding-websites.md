# De websites van Mokum — handleiding

> Voor **Nick en Mark**. Dit is het uitgebreide verhaal: wat er is, waar de gegevens
> vandaan komen, wat er wel en niet kan, en wat je doet als iets niet werkt.
>
> Voor het personeel bij de kassa zijn er vier A4'tjes met alleen het hoognodige:
> `frontend/public/quickstart/` — online op **mokum-streams.pdscloud.nl/quickstart/**.
> Zie het hoofdstuk *De quickstart-vellen* onderaan.

## Wat er allemaal is

Alles staat op één adres: **mokum-streams.pdscloud.nl**. Daarachter zitten een paar
losse pagina's, elk met een eigen doel.

| Pagina | Adres | Voor wie |
|---|---|---|
| **Mokum Live** | `/mokumlive/` | Iedereen — gasten, spelers, thuiskijkers |
| **Mokum Archief** | `/archief/` | Iedereen |
| **Mokum Challenge** | `/challenge.html` | Leden met een Cuescore-account |
| Quickstart | `/quickstart/` | Personeel (de vellen bij de kassa) |
| Dashboard | `/` | Alleen Nick, Mark en Peter — wachtwoord nodig |
| Highlights keuren | `/keuring/` | Alleen beheerders — wachtwoord nodig |
| Techniek-uitleg | `/uitleg/` | Wie wil weten hoe een stream start en stopt |
| Pauzescherm | `/pauze/` | Niemand — dit is wat OBS in de uitzending toont |

De eerste drie zijn de publieke sites. De rest is intern of technisch; die horen niet
op een vel bij de kassa.

> **`/standen/` bestaat nog maar stuurt door.** Dat was de oude naam van Mokum Live.
> Oude QR-codes en links in YouTube-beschrijvingen blijven daardoor werken. Gebruik
> voor nieuwe dingen altijd `/mokumlive/`.

---

## Mokum Live

**Wat het is.** De pagina waar je in één oogopslag ziet wat er in de zaal gebeurt: welke
wedstrijden er lopen, wat de stand is, en welke tafels op dat moment worden uitgezonden.

**Waar de gegevens vandaan komen.** Uit **Cuescore**. Onze backend haalt daar elke minuut
de stand op en zet die klaar voor de pagina. Wij verzinnen niets zelf en corrigeren niets:
staat er een verkeerde score, dan staat die verkeerd in Cuescore.

**Wat je ermee kunt.**

- Drie weergaven: **S** (compacte lijst), **M** (kaarten per tafel) en **XL** (voor een
  groot scherm, met de livestream ernaast).
- Tafels **vastpinnen** met 📌 — dan staan jouw tafels bovenaan. Dat onthoudt de browser
  op dat apparaat; het is geen account.
- Filteren op alleen live, of afgelopen wedstrijden verbergen.
- Een tafel met 📺 wordt uitgezonden; erop tikken opent de stream.

**Wat het niet kan.**

- **Alleen wedstrijden die in Cuescore staan.** Een vrij potje of een onderonsje verschijnt
  hier niet. Dat is de meestgestelde vraag aan de bar.
- **Alleen tafel 1, 3, 15 en 16 hebben een camera.** Op de andere twaalf tafels kan wel
  gespeeld en gescoord worden, maar niet gefilmd.
- De pagina staat niet in Google: hij heeft `noindex`. Bewust — hij is bedoeld om te delen
  via een link of QR, niet om gevonden te worden op een zoekwoord.

**Als het niet werkt.**

- *Alles leeg, geen enkele tafel.* Meestal is er gewoon niets bezig. Staat er wél iets in
  Cuescore en hier niet, dan haalt de backend Cuescore niet — dat lost zichzelf meestal
  binnen een paar minuten op.
- *Score loopt achter.* De pagina ververst elke ~15 seconden en de backend elke minuut. Een
  minuut vertraging is normaal.
- *Stream doet het niet.* Dat is YouTube of OBS, niet deze pagina. Kijk op het dashboard of
  de uitzending nog loopt.

---

## Mokum Archief

**Wat het is.** Een zoekmachine over alle uitgezonden wedstrijden. Typ een naam en je krijgt
elke partij die die speler heeft gespeeld, met een link die de video opent **op het moment
dat die partij begon**.

**Hoe dat kan.** Bij het afronden van een uitzending koppelen we de wedstrijdtijden uit
Cuescore aan de starttijd van de video. Daaruit rollen de hoofdstukken in de
YouTube-beschrijving én de zoekresultaten hier.

**Belangrijk om te weten.** Het zijn **deeplinks, geen losse filmpjes**. Je springt naar een
tijdstip in de volledige uitzending. YouTube kent geen "playlist van fragmenten", dus dit is
de manier waarop het kan.

**Wat er niet in staat.**

- Wedstrijden op tafels zonder camera.
- Uitzendingen van vóór de automatisering die nog geen hoofdstukken hebben. Dat wordt
  stukje bij beetje bijgewerkt.
- Challenges — die staan er nu nog niet in. Daar wordt aan gewerkt.

**Een video laten verwijderen.** Vraagt een speler daarom, dan kan dat. Peter zet hem op
verborgen of haalt hem weg. Verborgen is meestal genoeg: hij is dan niet meer te vinden,
maar bestaande links blijven werken.

---

## Mokum Challenge

**Wat het is.** Leden maken zelf een challenge-partij aan in Cuescore, zonder dat Nick of
Mark achter de computer hoeft te kruipen. Kiezen wie, welke spelsoort, tot hoeveel — klaar.

**Waarom het gemaakt is.** Elke challenge moest handmatig in Cuescore worden gezet. Gebeurde
dat niet, dan verscheen de partij nergens: niet op Mokum Live, niet in het archief, en de
uitzending kon er niet aan gekoppeld worden.

**Waar je op moet letten — lees dit even.**

1. **Het lid logt in met zijn eigen Cuescore-account.** Cuescore heeft geen nette manier om
   een andere website namens jou iets te laten doen (geen "inloggen met…"), dus het
   wachtwoord moet erdoorheen.
2. **Dat wachtwoord bewaren we versleuteld** (AES-256-GCM, sleutel in de Azure Key Vault),
   zodat een lid het niet elke keer hoeft in te typen. Peter heeft dit bewust zo besloten
   na het afwegen van de risico's. Wil iemand dat niet — volstrekt redelijk — dan maak jij
   de partij gewoon met de hand aan.
3. **Er zit nog geen clubcode op.** Iedereen met de link én een Cuescore-account kan er nu
   bij. Deel de link daarom niet breder dan de zaal. Dit staat op de lijst om af te schermen.

**Wat er daarna gebeurt.** De partij staat in Cuescore, dus de scores verschijnen vanzelf op
Mokum Live. Wordt er op een cameratafel gespeeld, dan kan iemand de uitzending starten via
het dashboard.

---

## Hoe het samenhangt

```
   Cuescore  ──►  onze backend  ──►  Mokum Live / Archief
  (de bron)        (elke minuut)
                        │
                        └────────►  OBS in de zaal  ──►  YouTube
                                    (camera's 1, 3, 15, 16)
```

**Cuescore is de waarheid.** Klopt iets niet op onze pagina's, kijk dan eerst of het in
Cuescore wél klopt. Zo ja, dan is het een storing bij ons. Zo nee, dan moet het daar
gecorrigeerd worden — wij kunnen dat niet overrulen.

**De streams hebben geen geluid.** Bewust: de muziek in de zaal live uitzenden zou
Buma/Stemra-rechten raken. Losse commentaar-microfoon staat op de wensenlijst.

---

## Wat gaat er vanzelf?

Sinds 4 augustus 2026 draait een toernooiavond volledig automatisch, mits het toernooi in
de **Toernooi planner** op het dashboard staat:

- 30 minuten vooraf worden losse uitzendingen op de toernooitafels gesloten
- 5 minuten vooraf gaan de uitzendingen aan, met het pauzescherm
- Het pauzescherm gaat weg zodra de eerste bal valt
- Bij de finale sluiten de overige cameratafels
- Na afloop: medaillescherm, stoppen, en automatisch een thumbnail plus hoofdstukken

**Niet automatisch:** losse partijen en challenges. Die start én stop je met de hand. Vergeet
je te stoppen, dan loopt de uitzending door tot de nachtstop van 02:00 en staat er de
volgende dag een video van tien uur op het kanaal. Dat is een paar keer gebeurd; er wordt aan
een oplossing gewerkt.

**De 14.1-league hoort niet in de planner.** Dat zijn losse partijen die spelers zelf
inplannen; die start je per stuk, wel gekoppeld aan de league.

---

## De quickstart-vellen

Vier A4'tjes voor bij de kassa: één per site, plus één over het toevoegen aan je telefoon.

**Printen.** Ga naar **mokum-streams.pdscloud.nl/quickstart/** en klik op *Printen*. Of open
`frontend/public/quickstart/index.html` en druk op Ctrl+P.

> Zet het formaat op **A4 op ware grootte**, niet op "passend maken" of "verkleinen".
> Anders wordt de QR-code kleiner dan bedoeld en pakken telefoons hem minder goed.

**De QR-codes.** Die worden gemaakt door `frontend/scripts/gen-quickstart-qr.mjs` en staan
als SVG in `public/quickstart/qr/`. Verandert er ooit een adres, pas dan dat script aan en
draai `npm run quickstart:qr` — niet zelf een code van een willekeurige website plukken,
want dan weet niemand later meer waar hij vandaan kwam.

**Ze zijn meetbaar.** Elke QR-code heeft `?utm_source=qr` in het adres. De pagina's melden
dat aan onze eigen teller, dus in het dashboard is te zien hoe vaak er bij de kassa gescand
wordt. Handig om te weten of die vellen daar iets doen of alleen stof vangen.

**Tekst aanpassen.** Alles staat in één bestand, `public/quickstart/index.html`, met per vel
een blok dat begint met een commentaarregel (`<!-- 1. MOKUM LIVE -->`). Vraag Peter, of pas
het zelf aan als je je op je gemak voelt met HTML.

---

## Wat je gasten eerlijk moet kunnen vertellen

- **"Word ik gefilmd?"** Op tafel 1, 3, 15 en 16 hangen camera's, en die uitzendingen zijn
  openbaar op YouTube. Op de andere tafels niet. Wil iemand niet in beeld: laat hem op een
  andere tafel spelen, of zet die tafel niet aan.
- **"Blijft dat voor altijd staan?"** De uitzendingen blijven op het kanaal staan. Wil je er
  eentje weg, dan kan dat — vraag het aan Nick of Mark.
- **"Wordt er geluid opgenomen?"** Nee, de streams zijn zonder geluid.
- **"Wat doen jullie met mijn Cuescore-wachtwoord?"** Zie het hoofdstuk over Challenge
  hierboven. Wees hier eerlijk over; het is een redelijke vraag.

---

## Bekende beperkingen

- **Geen clubcode op de challenge-pagina.**
- **Niet alles heeft een thumbnail.** Van de ruim 440 video's op het kanaal hebben er nog
  bijna 200 geen eigen omslagplaatje, vooral van vóór de automatisering. Het kanaal ziet er
  daardoor op sommige plekken rommelig uit. Er wordt aan gewerkt.
- **Losse uitzendingen stoppen niet vanzelf.**
- **De sites staan niet op de Mokum-website zelf.** Dat is een apart traject met Boei17
  (Sander); tot die tijd is de QR-code of een gedeelde link de manier waarop mensen erbij
  komen.

---

## Wie bel je waarvoor

| Wat | Wie |
|---|---|
| Stream start niet, beeld is zwart, tafel doet het niet | Peter |
| Een video moet weg of aangepast | Peter |
| Score klopt niet | Eerst Cuescore nakijken — dat is de bron |
| Een lid wil een challenge maar heeft geen account | Nick of Mark, met de hand in Cuescore |
| De vellen bij de kassa zijn op of verouderd | Opnieuw printen via `/quickstart/` |

---

## Waar de rest staat

- `docs/handleiding-nick.md` — een stream starten en stoppen via het dashboard
- `docs/avond-runbook.md` — hoe een toernooiavond verloopt
- `/uitleg/` op de site — hoe de techniek achter een stream werkt
- `CLAUDE.md` en `docs/sessies/` — de projectgeschiedenis en de besluiten
