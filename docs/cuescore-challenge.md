# Cuescore-koppelvlak — hoe het aanmaken van een challenge werkt

Uitgezocht en **live geverifieerd op 02-08-2026** met een echt account. Alles hieronder
is waargenomen gedrag, geen aanname.

## Belangrijk vooraf

Cuescore heeft **geen officiële API om iets aan te maken** (`cuescore.com/api` geeft 404) en
**geen "geef deze app toegang"-mechanisme** zoals OAuth. Wat we van een lid opslaan, geeft
volledige toegang tot hun account: wedstrijden aanmaken, wijzigen, verwijderen, profiel
aanpassen. Er is geen manier om dat te beperken tot alleen challenges.

Dit is een bewuste keuze van Peter (02-08): wachtwoorden worden versleuteld opgeslagen zodat
leden ze maar één keer hoeven in te vullen. De risico's zijn besproken.

## 1. Inloggen

**Niet** het formulier op `/login/` posten — dat verstuurt zichzelf niet en geeft stilletjes
een 200 met de pagina terug. Hun JavaScript (`CS.User.login` → `CSForm`) doet een aparte
AJAX-POST. Hier zijn we de eerste poging op vastgelopen.

```
POST https://cuescore.com/ajax/user/login.php
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://cuescore.com/login/

postUrl=/ajax/user/login.php & domPath=.User .login > form & redirect= & callback=
& hideOnOK=true & useSpinner=true & cover=          <- velden van hun eigen formulier-helper
& username=<e-mail> & password=<wachtwoord> & remember=on & submit=Log in
```

Antwoord bij succes: `{"statusCode":"OK","statusMsg":"Logging in..."}`

**Cookies:** vóór het inloggen krijg je `PHPSESSID` en `locale`. Na een geslaagde login komt
er **`user`** bij — dat is de blijvende cookie van "Remember me on this device". Die maakt het
mogelijk om niet bij elke aanvraag opnieuw in te loggen. Levensduur nog niet gemeten.

Geen captcha, geen tweestapsverificatie, geen verborgen formuliervelden (gecontroleerd).

## 2. Sessie toetsen

Snelste manier om te zien of je nog ingelogd bent:

```
GET /ajax/api/get/venue/search/?q=mokum
```

Uitgelogd: `{"error":"Please log in to search!"}` — ingelogd: een lijst met locaties.

## 3. Speler zoeken (tegenstander kiezen)

```
GET /ajax/api/get/player/search/?search=<naam>
```
Geeft een lijst met `playerId` en `name`. Let op: `country` is een **object**, geen tekst.

## 4. Challenge aanmaken

```
POST https://cuescore.com/ajax/api/set/challenge/create/
Content-Type: application/json

{
  "discipline": 3,            // 9-Ball
  "raceTo": 5,
  "breakrule": "winner",      // of "alternate"
  "video": "",
  "playerBId": 3404805,       // de tegenstander; speler A ben jij (uit je sessie)
  "venueId": 60451687,
  "tableId": 61403749,
  "timezone": "Europe/Amsterdam",
  "resume": false
}
```

Antwoord: `{"success":true,"message":"Challenge created.","challengeId":85948096,"matchId":85948093}`

De **`matchId`** is bruikbaar om er later een stream aan te koppelen (mokum-streams #88).

Verwante endpoints, nog niet uitgeprobeerd:
`/ajax/api/set/challenge/edit/` (met `challengeId`) en `/ajax/api/set/challenge/trash/`.

## 5. Wat er NIET geautomatiseerd wordt

Na het aanmaken toont het scorebord "Wie begint de wedstrijd?". Dat blijft handwerk: wie
breekt wordt bepaald door **de lag** — beide spelers stoten een bal via de band en wie het
dichtst bij de band eindigt begint. Dat is een fysieke uitkomst aan de tafel; daar heeft
software niets te zoeken (besluit Peter, 02-08).

## 6. Vaste gegevens Mokum

Locatie: **`60451687`** (Mokum Pool & Darts, Nobelweg 2).
Let op: er bestaat ook een lege locatie **"Mokum" (65271949)** zonder tafels — die niet gebruiken.

| Tafel | tableId | | Tafel | tableId |
|---|---|---|---|---|
| 1 | 61403749 | | 11 | 61403788 |
| 2 | 61403761 | | 12 | 61403791 |
| 3 | 61403764 | | 13 | 61403794 |
| 4 | 61403767 | | 14 | 61403797 |
| 5 | 73782388 | | 15 | 61403800 |
| 6 | 61403773 | | 16 | 61403803 |
| 7 | 61403776 | | 17 | 74876986 (English pool) |
| 8 | 61403779 | | 18 | 74877322 (English pool) |
| 9 | 61403782 | | 19 | 74877334 (Carambole) |
| 10 | 61403785 | | | |

De id's zijn **niet** af te leiden uit het tafelnummer — tafel 5 valt buiten de reeks van de
rest. Ze moeten dus vast opgeslagen worden. Cameratafels van de stream: 1, 3, 15, 16.

Discipline 9-Ball = `3`. Overige disciplinenummers nog niet uitgezocht.
