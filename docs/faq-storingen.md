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

## Nog toe te voegen
Dit bestand groeit mee met nieuwe incidenten. Bij elk afgerond issue over een
herkenbare storing: hier een punt bij, met de link naar het issue voor de details.
