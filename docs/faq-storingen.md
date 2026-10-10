# FAQ — veelvoorkomende storingen en oplossingen

Voor iedereen die 's avonds met de stream te maken krijgt (ook niet-technisch). Elk
punt: wat je ziet, wat je zelf kunt doen, en of/wanneer het structureel is opgelost.

Losse incidenten staan uitgebreider in de GitHub-issues (link per punt) — daar staat
de volledige diagnose en discussie. Dit bestand is de korte, praktische samenvatting.

---

## Zwart beeld op een tafel, overlay (scores/logo) is wel zichtbaar

**Wat je ziet:** de kijker ziet alleen het logo/de overlay, geen camerabeeld.

**Meest voorkomende oorzaak:** na een stroomstoring start de streaming-pc zichzelf
weer op, maar Windows vraagt daarbij soms een beveiligingsmelding te bevestigen
("Wilt u openbare en privénetwerken toegang geven tot deze app?" voor OBS Studio).
Die melding blijft openstaan totdat iemand hem wegklikt — de pc kan dit niet zelf.

**Wat je zelf kunt doen (als het zich toch nog voordoet):**
1. Via Chrome Remote Desktop inloggen op de streaming-pc.
2. Kijk of er een Windows-melding open staat ("Wilt u ... toegang geven") — klik op
   **Toestaan**. Dit kan tot 4x nodig zijn (één keer per tafel).
3. Ook als er geen melding meer is: in OBS de camera-bron van elke tafel verversen
   (rechtermuisknop op de bron → **Properties** → **OK**, zonder iets te wijzigen).

**Structureel opgelost?** Ja, sinds 29-09: er staat nu een vaste firewall-toestemming
voor alle 4 OBS-instanties, zodat Windows die melding niet meer laat zien — ook niet na
een stroomstoring. Zie [#167](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/167).
Komt het toch nog voor: meld het, dan is de vaste regel om een andere reden weg.

**Incident:** 29-09-2026, stroomstoring 10:11, pc terug 10:22, opgemerkt om 20:00
(stream was om 19:15 gestart). [#167](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/167)

---

## Alle tafels van een meerdaags toernooi stoppen midden in de wedstrijd

**Wat je ziet:** de streams van een toernooi dat meerdere dagen duurt (bijv. een weekend-
toernooi) stoppen op dag 2 of 3 vanzelf, soms meerdere tafels tegelijk, ook als er nog gespeeld wordt.

**Oorzaak:** de eindtijd uit de Toernooi planner staat nog op die van de vorige dag
(bijv. 02:30 vannacht). Die tijd is al voorbij, dus het systeem denkt dat het toernooi klaar
is. Normaal beschermt een lopende wedstrijd de stream, maar zodra Cuescore even niet
reageert valt die bescherming weg.

**Wat je zelf kunt doen:** de **Eind**-tijd van het toernooi in de planner op een
tijdstip in de toekomst zetten (bijv. 01:30 de volgende nacht) vóór je de streams start.
Starten voordat de eindtijd is aangepast heeft geen zin: de stream wordt weer gestopt.

**Structureel opgelost?** Nog niet. Zie [#171](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/171).
Zolang dat open staat, moet bij een meerdaags toernooi elke dag de eindtijd vooruit gezet worden.

**Incident:** 03-10-2026, OnePocket-weekend, tafel 1, 3, 15 en 16. [#171](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/171)

---

## Nog toe te voegen
Dit bestand groeit mee met nieuwe incidenten. Bij elk afgerond issue over een
herkenbare storing: hier een punt bij, met de link naar het issue voor de details.

---

## Medaillescherm van het vorige toernooi op een tafel van een ander toernooi

**Wat je ziet:** een toernooi is net afgelopen en op een tafel waar een ánder toernooi
zendt (nog zonder partij) verschijnt het podium van het eerste toernooi, bijvoorbeeld
zodra de jumbotron aan gaat.

**Wat je zelf kunt doen (als het toch nog voorkomt):**
1. Zet de jumbotron van die tafel uit in het dashboard.
2. Geef het door; dan kijken we of de stream aan het juiste toernooi hangt.
3. Na een deploy duurt het tot een minuut voordat de nieuwe regel meetelt.

**Structureel opgelost?** Ja, sinds 04-10: een podium verschijnt alleen op een tafel
waar de stream bij hetzelfde toernooi hoort. Zie [#178](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/178).

---

## Pauzescherm in beeld bij een challenge (of custom stream)

**Wat je ziet:** je start een challenge met het scorebord aan en de jumbotron uit, maar na een
minuut of twee staat het pauzescherm in beeld en is het scorebord weg.

**Wat je zelf kunt doen (als het toch nog voorkomt):**
1. Zet in het dashboard bij die tafel de jumbotron uit en het scorebord aan.
2. Daarna grijpt het systeem niet opnieuw in; het gebeurde maar één keer, kort na de start.
3. Voor een challenge of custom stream bedien je de overlays altijd zelf.

**Structureel opgelost?** Sinds 09-10 (deploy `4c9a9d2`): challenge- en custom-streams doen niet
meer mee aan het automatische pauzescherm, en de herstelcontrole corrigeert niets meer vlak na
de start. Nog te bevestigen op een echte challenge-start. Zie [#183](https://github.com/peterdeswart96-ship-it/mokum-streams/issues/183).

**Incident:** 09-10-2026, challenge Richard vs Marco, tafel 1.
