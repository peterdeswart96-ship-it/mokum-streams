# Livestream starten & stoppen — korte handleiding

Zo zet je een tafel live op YouTube en zet je 'm weer uit. Je hoeft niets aan OBS of de
computer te doen — alles gaat via het **dashboard** op je telefoon, tablet of pc.

Dashboard: **mokum-streams.pdscloud.nl**

> **Eenmalig inloggen:** de eerste keer vraagt de pagina om een toegangscode (token).
> Die krijg je van Peter. Vul 'm één keer in — daarna onthoudt je apparaat het en hoef
> je het niet meer te doen.

---

## Een stream starten

1. Open **mokum-streams.pdscloud.nl**.
2. Klik op de rode knop **➕ Nieuwe stream** (rechtsboven).
3. Kies de **tafel** waar gespeeld wordt (1, 3, 15 of 16 — dat zijn de tafels met camera).
4. Vul bij **titel** de toernooinaam in, bijv. `Mokum MEGA Summer Ranking #21`.
5. Zichtbaarheid op **Openbaar** laten staan (zo kan iedereen meekijken).
6. Klik op **starten**.

Binnen een paar seconden staat de tafel **● LIVE**. Klaar. De scores en sponsors komen
automatisch in beeld.

> Speel je op meerdere tafels tegelijk? Herhaal stap 2–6 voor elke tafel.

---

## Een stream stoppen

1. Zoek op het dashboard de kaart van de tafel die live staat.
2. Klik op **Stop stream**.

De tafel gaat uit beeld en de camera is weer vrij voor een volgende keer.

> **Vergeet niet te stoppen** als het toernooi klaar is — anders blijft de stream
> onnodig doorlopen.

---

## Overlays aan/uit (optioneel)

Op elke tafelkaart staan knopjes:

- **Sponsors** — de sponsor-diavoorstelling (standaard aan).
- **Scorebord** — de live score van de wedstrijd (standaard aan).
- **Jumbotron / Pauzemelding** — voor tijdens een pauze (nog in de maak).

Je hoeft hier meestal niets aan te doen; standaard staat alles goed.

---

## Als er iets niet lukt

- **Tafel gaat niet live / blijft hangen?** Wacht ~10 seconden en ververs de pagina
  (↻). Gebeurt er nog niets, bel of app Peter — de streaming-pc moet dan aan staan en
  OBS moet draaien.
- **"Tafel is al in gebruik"?** Er loopt al een stream op die tafel. Stop die eerst, of
  gebruik 'm gewoon (hij staat al live).
- **Verkeerde titel ingevuld?** Stop de stream en start 'm opnieuw met de juiste titel.

---

## Noodstop

Moet alles **direct** uit? Klik per live tafel op **Stop stream**. Er komt later ook een
fysieke noodstop-knop (Stream Deck) bij de pc.

---

## Een sponsorplaatje verwijderen (uitzondering)

Dit is de enige taak in deze handleiding die **niet** via het dashboard gaat — hiervoor
moet je op de streaming-pc zelf inloggen (Peter kan je daar remote toegang toe geven,
bijv. via Chrome Remote Desktop). Doe dit het liefst als er niets live staat.

1. **Log in op de streaming-pc** (remote of fysiek in de zaal).
2. Open de map **`C:\Mokum-Sponsors`** en verwijder daar het plaatje.
3. De "Sponsor slideshow"-bron in OBS wijst naar die hele map (niet naar losse
   bestanden), dus meestal is stap 2 al genoeg. Blijft het plaatje toch nog een tijdje
   voorbijkomen op een van de 4 tafels (1, 3, 15, 16), forceer dan een herinlezing:
   - Rechtsklik de bron **"Sponsor slideshow"** in de bronnenlijst → zet het oogje
     (zichtbaarheid) **uit en weer aan**.
   - Blijft het plaatje er toch in staan, open dan **Properties** op die bron en klik op
     **OK** — dat leest de map ook opnieuw in.

> Controleer dit gerust op alle 4 de OBS-vensters, maar in de praktijk delen ze
> dezelfde map — verwijderen op één plek is voor alle 4 tegelijk genoeg.

---

*Vragen of iets kapot? App Peter. Deze streams hebben bewust **geen geluid**
(auteursrecht op de achtergrondmuziek) — dat is dus geen storing.*
