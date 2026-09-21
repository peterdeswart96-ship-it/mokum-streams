// HTML→PNG thumbnail-renderer (#56). Rendert de per-toernooi-ontwerpen uit
// assets/thumbnail-templates/*.html (CSS + ingebedde webfonts/logo's, 1280×720) met een
// headless Chromium naar een PNG-buffer. De ontwerpen zelf zijn de bron van waarheid;
// deze module vult alleen de placeholders in en maakt de foto.
//
// Waar draait Chromium?
//  - Lokaal (dev): de geïnstalleerde Chrome/Edge (auto-detect of via CHROME_PATH).
//  - Azure Functions: de gebundelde Chromium van @sparticuz/chromium.
// De browser wordt één keer gestart en hergebruikt (finalize draait zelden, maar meerdere
// tafels achter elkaar delen zo één browser).

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'assets', 'thumbnail-templates');
const W = 1280, H = 720;

let browserPromise = null;

// Zoekt een lokaal geïnstalleerde Chrome/Edge (alleen dev). Retourneert null op een
// server zonder browser → dan pakt getBrowser() de gebundelde Chromium.
function detecteerLokaleChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const kandidaten = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
       'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : [];
  return kandidaten.find((p) => fs.existsSync(p)) || null;
}

async function getBrowser() {
  if (browserPromise) {
    try { const b = await browserPromise; if (b.connected) return b; } catch { /* opnieuw starten */ }
    browserPromise = null;
  }
  browserPromise = (async () => {
    const lokaal = detecteerLokaleChrome();
    if (lokaal) {
      return puppeteer.launch({
        headless: true,
        executablePath: lokaal,
        args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
      });
    }
    // Serverless (Azure Functions Linux): gebundelde Chromium.
    // @sparticuz/chromium is ESM; vanuit CommonJS zit de module onder .default.
    const mod = require('@sparticuz/chromium');
    const chromium = mod.default || mod;
    // De gebundelde NSS-libs (libnspr4.so/libnss3.so) worden alléén op Amazon Linux
    // automatisch uitgepakt. Azure draait op een andere Linux, dus doen we het zelf:
    // al2023.tar.br uitpakken en LD_LIBRARY_PATH/FONTCONFIG_PATH/HOME zetten. Zonder dit
    // faalt Chromium met "libnspr4.so: cannot open shared object file".
    try {
      const binDir = path.join(path.dirname(require.resolve('@sparticuz/chromium')), '..', 'bin');
      const libDir = path.join(await mod.inflate(path.join(binDir, 'al2023.tar.br')), 'lib');
      mod.setupLambdaEnvironment(libDir);
    } catch (e) { /* al uitgepakt of niet nodig op deze host */ }
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  })();
  return browserPromise;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vulPlaceholders(html, velden) {
  return html
    .replace(/\{\{TOERNOOINAAM\}\}/g, escapeHtml(velden.toernooinaam))
    .replace(/\{\{DATUM\}\}/g, escapeHtml(velden.datum))
    .replace(/\{\{SPELERS\}\}/g, escapeHtml(velden.spelers))
    .replace(/\{\{SPONSOR\}\}/g, escapeHtml(velden.sponsor))
    // Competitie-template (#82)
    .replace(/\{\{NIVEAU\}\}/g, escapeHtml(velden.niveau))
    .replace(/\{\{THUISTEAM\}\}/g, escapeHtml(velden.thuisteam))
    .replace(/\{\{UITTEAM\}\}/g, escapeHtml(velden.uitteam));
}

// Rood "FINAL"-lint rechtsboven (#123), voor de finale van een toernooireeks — herbruikbaar
// bovenop ELK bestaand sjabloon i.p.v. een aparte finale-versie per toernooi te moeten
// maken. Puur CSS (geen los plaatje). Moet als LAATSTE kind van .canvas ingevoegd worden
// (niet ergens los in <body>): de screenshot pakt alleen dat element, en .canvas' eigen
// overflow:hidden knipt een lint daarbuiten gewoon weg.
// Font-size 34px→51px (+50%, op Peters verzoek) en het font exact gelijk aan .title
// elders op de thumbnail ('Anton'/'Arial Black', geen extra sans-serif-fallback).
const FINALE_LINT = '<style>.finalelint{position:absolute;top:0;right:0;width:300px;height:300px;overflow:hidden;z-index:20;pointer-events:none}'
  + '.finalelint span{position:absolute;display:block;width:420px;padding:10px 0;background:#cc0000;'
  + "box-shadow:0 4px 14px rgba(0,0,0,.5);color:#fff;font-family:'Anton','Arial Black';"
  + 'font-size:51px;text-align:center;letter-spacing:6px;text-transform:uppercase;transform:rotate(45deg);'
  + 'top:44px;right:-110px}</style><div class="finalelint"><span>FINAL</span></div>';

// Plakt het lint vlak vóór de sluitende tags van .canvas/body/html (altijd de allerlaatste
// regel van elk sjabloon, zie bouw-thumbnail-templates.js). Geen match (onverwachte
// sjabloonvorm) → HTML ongewijzigd terug, liever geen lint dan een kapotte render.
function voegFinaleLintToe(html) {
  return /<\/div>\s*<\/body>\s*<\/html>\s*$/.test(html)
    ? html.replace(/<\/div>\s*<\/body>\s*<\/html>\s*$/, `${FINALE_LINT}</div></body></html>`)
    : html;
}

// Jackpot-badge naast de datumpil linksonder (#150): bij toernooien met een extra jackpot.
// Zelfde aanpak als het FINAL-lint hierboven — één overlay bovenop elk sjabloon, in plaats van
// vier sjablonen apart aanpassen. Niet rechtsboven (daar zit bij een finale het lint) en niet
// in de rechterhoek: daar legt YouTube in elk overzicht de duurchip overheen, precies over het
// woord JACKPOT (gezien in de proefrender van 21-09).
// De pil groeit mee met de lengte van de datum ("DI 8 JULI" vs "WO 23 SEPTEMBER"), dus de
// exacte plek wordt tijdens het renderen gemeten (zie plaatsBadgeNaastDatum). De waarden
// hieronder zijn de terugval als die meting niet lukt: naast een pil van gemiddelde lengte.
// Het plaatje wordt als data-URI ingebed: de render draait op setContent(), dus een relatief
// bestandspad zou niet laden.
const BADGE_BESTAND = path.join(__dirname, '..', '..', 'assets', 'jackpot-badge.png');
let badgeDataUri = null;

function jackpotBadgeHtml() {
  if (badgeDataUri === null) {
    badgeDataUri = `data:image/png;base64,${fs.readFileSync(BADGE_BESTAND).toString('base64')}`;
  }
  return '<style>.jackpotbadge{position:absolute;left:430px;bottom:48px;width:95px;height:95px;'
    + 'z-index:20;pointer-events:none;filter:drop-shadow(0 4px 14px rgba(0,0,0,.6))}'
    + '.jackpotbadge img{width:100%;height:100%;display:block}</style>'
    + `<div class="jackpotbadge"><img src="${badgeDataUri}" alt=""></div>`;
}

// Zelfde invoegplek als het lint: als laatste kind van .canvas, want de screenshot pakt
// alleen dat element en overflow:hidden knipt alles daarbuiten weg.
function voegJackpotBadgeToe(html) {
  return /<\/div>\s*<\/body>\s*<\/html>\s*$/.test(html)
    ? html.replace(/<\/div>\s*<\/body>\s*<\/html>\s*$/, `${jackpotBadgeHtml()}</div></body></html>`)
    : html;
}

// Zet de badge vlak naast de datumpil en verticaal op dezelfde hoogte. Draait in de pagina
// (puppeteer), want alleen dáár is bekend hoe breed de pil met déze datum is geworden.
// Geen pil of geen badge → niets doen; de badge blijft dan op de CSS-terugval staan.
async function plaatsBadgeNaastDatum(page) {
  await page.evaluate(() => {
    const badge = document.querySelector('.jackpotbadge');
    const pil = document.querySelector('.datepill');
    const canvas = document.querySelector('.canvas');
    if (!badge || !pil || !canvas) return;
    const MARGE = 22; // tussenruimte pil → badge
    const c = canvas.getBoundingClientRect();
    const p = pil.getBoundingClientRect();
    const h = badge.getBoundingClientRect().height;
    badge.style.left = `${Math.round(p.right - c.left + MARGE)}px`;
    badge.style.right = 'auto';
    badge.style.top = `${Math.round(p.top - c.top + (p.height - h) / 2)}px`;
    badge.style.bottom = 'auto';
  });
}

function templatePad(key) {
  return path.join(TEMPLATE_DIR, `${path.basename(String(key))}.html`);
}

// Bestaat er een template voor deze key? (finalize gebruikt dit om te beslissen tussen
// de HTML-render en de canvas-fallback.)
function heeftTemplate(key) {
  return !!key && fs.existsSync(templatePad(key));
}

// Rendert een template naar een 1280×720 PNG-buffer.
// velden: { templateKey, toernooinaam, datum, spelers, sponsor, finale, jackpot, niveau, thuisteam, uitteam }
async function renderThumbnail(velden = {}) {
  const bestand = templatePad(velden.templateKey);
  const raw = fs.readFileSync(bestand, 'utf8');
  let html = vulPlaceholders(raw, {
    toernooinaam: velden.toernooinaam || '',
    datum: velden.datum || '',
    spelers: velden.spelers || '',
    sponsor: velden.sponsor || '',
    niveau: velden.niveau || '',
    thuisteam: velden.thuisteam || '',
    uitteam: velden.uitteam || '',
  });
  if (velden.finale) html = voegFinaleLintToe(html);
  if (velden.jackpot) html = voegJackpotBadgeToe(html);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    // Wacht tot de (ingebedde) webfonts geladen zijn, anders valt de render terug op een
    // systeemfont en klopt de layout niet.
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    // Ná de fonts: mét het echte font is de datumpil pas zo breed als 'ie wordt (#150).
    if (velden.jackpot) await plaatsBadgeNaastDatum(page);
    // Titel passend maken NÁ het laden van de fonts: krimp vanaf de vaste 150px tot de titel
    // binnen z'n vak past (hoogte én breedte). Korte namen blijven groot; lange krimpen net
    // genoeg zodat er niets wordt afgekapt. (Deterministisch — de template doet dit niet meer.)
    await page.evaluate(() => {
      const t = document.querySelector('.title');
      if (!t) return;
      // Meet tegen het TOEGESTANE vak (max-height + eigen breedte), niet tegen de huidige
      // box: het handschrift-font heeft hoge letters, dus scrollHeight > clientHeight is
      // normaal en geen echte overflow. We krimpen alleen als de titel écht niet past.
      const maxH = parseFloat(getComputedStyle(t).maxHeight) || 360;
      let s = parseFloat(getComputedStyle(t).fontSize) || 150;
      let guard = 60;
      while (guard-- > 0 && s > 56 && (t.scrollHeight > maxH + 2 || t.scrollWidth > t.clientWidth + 2)) {
        s -= 4; t.style.fontSize = `${s}px`;
      }
    });
    // Competitie (#82): beide teamnamen even groot houden en samen verkleinen tot ze in het
    // tekstvak passen. Een lange naam mag naar twee regels, maar niet uit het vak lopen.
    await page.evaluate(() => {
      // Het niveau blijft op één regel ("Derde Divisie Noord-West" brak anders op het streepje).
      const niv = document.querySelector('.niveau');
      if (niv) {
        let n = parseFloat(getComputedStyle(niv).fontSize) || 40;
        while (n > 20 && niv.scrollWidth > niv.clientWidth + 2) { n -= 2; niv.style.fontSize = `${n}px`; }
      }
      const vak = document.querySelector('.info');
      const teams = [...document.querySelectorAll('.team')];
      if (!vak || !teams.length) return;
      let s = parseFloat(getComputedStyle(teams[0]).fontSize) || 88;
      const pastNiet = () => vak.scrollHeight > vak.clientHeight + 2
        || teams.some((t) => t.scrollWidth > t.clientWidth + 2);
      let guard = 40;
      while (guard-- > 0 && s > 40 && pastNiet()) {
        s -= 4; teams.forEach((t) => { t.style.fontSize = `${s}px`; });
      }
    });
    const el = await page.$('.canvas');
    const png = await (el || page).screenshot({ type: 'png', ...(el ? {} : { clip: { x: 0, y: 0, width: W, height: H } }) });
    return png;
  } finally {
    await page.close().catch(() => {});
  }
}

// Netjes afsluiten (bv. in tests of bij shutdown).
async function sluitBrowser() {
  if (!browserPromise) return;
  try { const b = await browserPromise; await b.close(); } catch { /* al dicht */ }
  browserPromise = null;
}

module.exports = { renderThumbnail, heeftTemplate, sluitBrowser, voegFinaleLintToe, voegJackpotBadgeToe };
