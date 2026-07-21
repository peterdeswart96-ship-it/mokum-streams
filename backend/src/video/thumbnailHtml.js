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
    .replace(/\{\{SPONSOR\}\}/g, escapeHtml(velden.sponsor));
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
// velden: { templateKey, toernooinaam, datum, spelers, sponsor }
async function renderThumbnail(velden = {}) {
  const bestand = templatePad(velden.templateKey);
  const raw = fs.readFileSync(bestand, 'utf8');
  const html = vulPlaceholders(raw, {
    toernooinaam: velden.toernooinaam || '',
    datum: velden.datum || '',
    spelers: velden.spelers || '',
    sponsor: velden.sponsor || '',
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    // Wacht tot de (ingebedde) webfonts geladen zijn, anders valt de render terug op een
    // systeemfont en klopt de layout niet.
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready : null));
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

module.exports = { renderThumbnail, heeftTemplate, sluitBrowser };
