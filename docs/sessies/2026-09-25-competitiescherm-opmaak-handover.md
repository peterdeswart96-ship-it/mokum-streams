# Handover — sessie 25 september 2026 (competitiescherm: opmaak van de drie schermen + timer)

> Context van een chatsessie, bedoeld om een volgende sessie op de hoogte te brengen.
> Aanleiding: Peter wilde de opmaak van de schermen in de laatste 5 minuten van een
> competitiestream (#147) verbeteren. Werkwijze op zijn verzoek: **eerst per scherm varianten
> renderen en beoordelen, pas daarna bouwen.** Alles staat in één bestand:
> `frontend/public/competitie/index.html`.

## Wat er is veranderd

| Scherm | Voor | Nu |
|---|---|---|
| **Stand** | tabel met 9 kolommen en lijntjes, rode zijstreep bij de teams van vanavond | losse afgeronde balken, 5 kolommen (positie, team, gespeeld, partijen, punten), punten groot, nummer 1 rood; vanavond = donkerrode balk **zonder** rode zijstreep. Rijhoogte schaalt mee met 8–16 teams |
| **Uitslagen** | afgelopen 31 dagen, titel "Uitslagen afgelopen maand" | dezelfde balkenstijl; alleen de **laatste 2 rondes** (rechts staat "laatste 2 rondes"); winnaar wit, verliezer grijs, gelijkspel beide wit. Rijhoogte rekent met aantal wedstrijden + rondekoppen zodat het altijd in de kaart past |
| **Bedankt** | "Thanks for watching!", grote kaart | "Bedankt voor het kijken!", **kleinere kaart** (1408×730, staat lager) zodat de MOKUM-letters van de zaalfoto zichtbaar zijn; niveau als **gekleurde pil** (zelfde kleur als de thumbnail); eindstand groot met logo boven de naam, winnaar iets lichter kader; zin "Het weergeven van alle competitiestanden wordt mede mogelijk gemaakt dankzij:"; partners als smalle rij |
| **Niveau-pil in de kop** | rood tekstje boven de titel | dezelfde gekleurde pil als op Bedankt en de thumbnail, ook op Stand en Uitslagen (achteraf op verzoek, commit `ee8e4bd`) |
| **Timer** (nieuw) | — | dun rood balkje onderaan de kaart dat leegloopt + "nog 1:24" midden in de voettekst; komt uit dezelfde `planning()` als de schermwissel; niet bij `?scherm=`; bij 0 verdwijnt de tekst |

## Besluiten en waarom

- **Laatste 2 rondes i.p.v. 31 dagen:** het scherm werkte met een tijdvenster, niet met rondes.
  Met 3+ rondes werd het meerdere pagina's met steeds minder tijd per pagina (Derde Klasse: 3 × 40 s).
  Twee rondes past op 1 pagina (Derde Klasse: 2 pagina's van 60 s). Besluit Peter.
- **Geen rode zijstreep** bij de teams van vanavond (Peter, na het eerste voorbeeld). Er staan twee
  regels voor in het bestand; beide moesten weg.
- **Niveaupil op alle drie de schermen:** eerst alleen op Bedankt gevraagd; daarna liet Peter voorbeelden
  zien van Stand en Uitslagen met dezelfde pil en keurde die goed. Titel staat daardoor ~16 px lager.
- **Balk + tekst i.p.v. rondje** voor de timer: rustiger, op elk scherm op dezelfde plek, botst niet met de stippen.

## Valkuilen

- **Kleuren staan op twee plekken:** `backend/src/mokumCompetitie/niveauKleuren.js` én een kopie
  (`KLEUR_PER_NIVEAU`, `verkortNiveau`) in het competitiescherm. De pagina kan de backend niet importeren.
  Bij een nieuw niveau/seizoen beide bijwerken (staat ook in `thumbnail-ontwerp.md`).
- **Bestand heeft CRLF-regeleinden.** Wie het met een script bewerkt moet `\r\n` behouden, anders
  komt er een diff van het hele bestand of een mengvorm.
- **Oude "live"-wedstrijden in Cuescore:** in Derde Klasse stonden twee wedstrijden van 14 en 16 september
  nog op "playing". Het scherm toont die met een rode (live) score. Dat is Cuescore-data, geen opmaakfout.
- **Timer bij 0:00:** de stop valt op de minuutgrens en kan een paar seconden na de eindtijd komen; daarom
  verdwijnt de tekst bij 0 in plaats van "nog 0:00" te blijven tonen.

## Zo is het getest

Headless Chrome tegen echte Cuescore-data: Eerste Klasse (12 teams) en Derde Klasse (16 teams, 12 uitslagen
op één pagina), alle drie de schermen, `?demo&seconden=60` op drie momenten (stand nog 0:40, uitslagen 0:11,
bedankt 0:10), en Bedankt met twee absurd lange teamnamen (één zonder spaties — breekt nu af, kaders blijven gelijk).
**Niet getest:** een echte competitieavond in OBS (`#147` blijft daarom open, comment staat erop); de eerstvolgende competitiestream is de echte test.
Na een deploy moet de OBS-bron `Competitiestand` de nieuwe pagina laden (bron verversen of OBS herstarten).

## Documentatie bijgewerkt

`docs/api-contract.md` (uitslagen = laatste 2 rondes, bedankscherm + timer, geen koppelvlakwijziging),
`docs/obs-standaard.md`, `docs/ontwerp/competitie/thumbnail-ontwerp.md`.
