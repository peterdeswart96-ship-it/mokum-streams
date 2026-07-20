// Serverside thumbnail-generator (#56). Tekent met @napi-rs/canvas exact het goedgekeurde
// ontwerp (zie docs/ontwerp/thumbnail-ontwerp.html): 3-delen-layout, logo rechtsboven,
// spelsoort-bal, sponsorlogo bij een gesponsord toernooi, spelersnamen (toernooi) of VS
// (challenge), tafel + datum onderaan. Levert een 1280x720 PNG-buffer. Spoiler-vrij.
//
// Fonts worden meegebundeld (assets/fonts) en geregistreerd — Azure Functions Linux heeft
// geen Arial, dus we leunen niet op systeemfonts.

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FONTS = path.join(ASSETS, 'fonts');
// Zwaar display-font (Arial Black-vervanger) + normaal font voor lichtere tekst.
GlobalFonts.registerFromPath(path.join(FONTS, 'ArchivoBlack-Regular.ttf'), 'MokumBlack');
GlobalFonts.registerFromPath(path.join(FONTS, 'Archivo-Bold.ttf'), 'MokumSans');

const W = 1280, H = 720;
const PAD_X = 76, PAD_TOP = 46, PAD_BOT = 52;
const ROOD = '#cc0000', ROOD_LICHT = '#ff2b2b', GOUD = '#f4c430';

// Mokum-logo en (optioneel) sponsorlogo als bestand.
const MOKUM_LOGO = path.join(ASSETS, 'mokum-logo.png');
const SPONSOR_DIR = path.join(ASSETS, 'sponsors');

// ---------- tekst-helpers ----------
function zetFont(ctx, px, zwaar = true, spacing = 0) {
  ctx.font = `${px}px "${zwaar ? 'MokumBlack' : 'MokumSans'}"`;
  ctx.letterSpacing = `${spacing}px`;
}

// Breekt tekst in regels die binnen maxW passen. Retour: array regels.
function breekRegels(ctx, tekst, maxW) {
  const woorden = String(tekst).split(/\s+/);
  const regels = [];
  let regel = '';
  for (const w of woorden) {
    const kandidaat = regel ? `${regel} ${w}` : w;
    if (ctx.measureText(kandidaat).width > maxW && regel) {
      regels.push(regel); regel = w;
    } else {
      regel = kandidaat;
    }
  }
  if (regel) regels.push(regel);
  return regels;
}

// ---------- spelsoort-bal ----------
function tekenBal(ctx, cx, cy, r, num) {
  ctx.save();
  ctx.translate(cx, cy);
  const stripe = num === '9' || num === '10';
  const kleur = num === '10' ? '#1F6FD0' : '#F5B301';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  if (num === '8') {
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#565656'); g.addColorStop(0.28, '#2a2a2a'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fill();
  } else if (!stripe) {
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffe9a8'); g.addColorStop(0.2, kleur); g.addColorStop(1, '#8f6600');
    ctx.fillStyle = g; ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.72, '#ededed'); g.addColorStop(1, '#bcbcbc');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = kleur; ctx.fillRect(-r, -r * 0.45, 2 * r, r * 0.9); ctx.restore();
  }
  // witte cirkel + nummer
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#141414'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  zetFont(ctx, Math.round(r * (num.length > 1 ? 0.46 : 0.58)));
  ctx.fillText(num, 0, r * 0.02);
  // glans
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.4, r * 0.22, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Maakt van een logo een witte versie op maat → canvas om te tekenen. Werkt voor zowel
// zwart-op-transparant als zwart-op-wit: donkere pixels worden wit (met alpha = donkerte),
// lichte pixels transparant. Zo verdwijnt een eventuele witte achtergrond netjes.
async function witLogo(bestand, hoogte) {
  const img = await loadImage(bestand);
  const w = Math.round(hoogte * img.width / img.height);
  const off = createCanvas(w, hoogte);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, w, hoogte);
  const beeld = o.getImageData(0, 0, w, hoogte);
  const p = beeld.data;
  for (let i = 0; i < p.length; i += 4) {
    const bronAlpha = p[i + 3];
    const lum = (p[i] + p[i + 1] + p[i + 2]) / 3;
    p[i] = 255; p[i + 1] = 255; p[i + 2] = 255;              // wit
    p[i + 3] = Math.round(bronAlpha * (255 - lum) / 255);    // donker = zichtbaar, licht = transparant
  }
  o.putImageData(beeld, 0, 0);
  return off;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- achtergrond ----------
function tekenAchtergrond(ctx) {
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#15171b'); base.addColorStop(1, '#0a0b0d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  const rood = ctx.createRadialGradient(W * 0.3, -H * 0.1, 0, W * 0.3, -H * 0.1, 620);
  rood.addColorStop(0, 'rgba(204,0,0,0.28)'); rood.addColorStop(1, 'rgba(204,0,0,0)');
  ctx.fillStyle = rood; ctx.fillRect(0, 0, W, H);
  const blauw = ctx.createRadialGradient(W, H * 1.2, 0, W, H * 1.2, 700);
  blauw.addColorStop(0, 'rgba(20,40,70,0.5)'); blauw.addColorStop(1, 'rgba(20,40,70,0)');
  ctx.fillStyle = blauw; ctx.fillRect(0, 0, W, H);
}

function lijn(ctx, y) {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_X, y); ctx.lineTo(W - PAD_X, y); ctx.stroke();
}

function tafelPill(ctx, x, y, tekst) {
  zetFont(ctx, 34);
  const tw = ctx.measureText(tekst).width;
  const w = tw + 56, h = 54;
  ctx.fillStyle = ROOD; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tekst, x + 28, y + h / 2 + 1);
  return w;
}

// ---------- hoofd ----------
// opts: { type:'toernooi'|'challenge', naam, spelers:[], spelerA, spelerB, tafel,
//         datumLabel, spelsoort:('1'|'8'|'9'|'10'|'8-10'|null), sponsor:(bestandsnaam|null) }
async function genereerThumbnail(opts = {}) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  tekenAchtergrond(ctx);

  const clusterMidY = PAD_TOP + 75;
  let rechtsX = W - PAD_X;

  // Mokum-logo (uiterst rechts)
  const mokum = await loadImage(MOKUM_LOGO);
  const mokumH = 150, mokumW = Math.round(mokumH * mokum.width / mokum.height);
  ctx.drawImage(mokum, rechtsX - mokumW, clusterMidY - mokumH / 2, mokumW, mokumH);
  rechtsX -= mokumW + 26;

  // Spelsoort-bal(len)
  if (opts.spelsoort) {
    const r = 65; // diameter 130
    if (opts.spelsoort === '8-10') {
      tekenBal(ctx, rechtsX - r, clusterMidY, r, '10'); rechtsX -= r * 2 - 18;
      tekenBal(ctx, rechtsX - r, clusterMidY, r, '8'); rechtsX -= r * 2 + 26;
    } else {
      tekenBal(ctx, rechtsX - r, clusterMidY, r, opts.spelsoort); rechtsX -= r * 2 + 26;
    }
  }

  // Sponsorlogo (wit), links van de bal
  if (opts.sponsor) {
    try {
      const logo = await witLogo(path.join(SPONSOR_DIR, opts.sponsor), 130);
      ctx.drawImage(logo, rechtsX - logo.width, clusterMidY - 65, logo.width, 130);
      rechtsX -= logo.width + 26;
    } catch (e) { /* sponsor onbekend → overslaan */ }
  }

  // Type-label (links)
  ctx.fillStyle = ROOD_LICHT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  zetFont(ctx, 36, false, 8);
  ctx.fillText((opts.type === 'challenge' ? 'Challenge match' : 'Toernooi').toUpperCase(), PAD_X, clusterMidY);
  ctx.letterSpacing = '0px';

  // Dividers
  const div1 = 206, div2 = 592;
  lijn(ctx, div1); lijn(ctx, div2);

  // ---- Midden ----
  const maxW = W - 2 * PAD_X;
  if (opts.type === 'challenge') {
    // VS gecentreerd
    const midY = (div1 + div2) / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    zetFont(ctx, 72);
    const a = opts.spelerA || '?', b = opts.spelerB || '?';
    const badgeR = 60, gap = 44;
    const aw = Math.min(ctx.measureText(a).width, 430);
    const bw = Math.min(ctx.measureText(b).width, 430);
    const totaal = aw + gap + badgeR * 2 + gap + bw;
    let x = (W - totaal) / 2;
    ctx.textAlign = 'left';
    ctx.fillText(a, x, midY); x += aw + gap;
    // VS-badge
    ctx.strokeStyle = ROOD; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(204,0,0,0.15)';
    ctx.beginPath(); ctx.arc(x + badgeR, midY, badgeR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ROOD_LICHT; ctx.textAlign = 'center'; zetFont(ctx, 44);
    ctx.fillText('VS', x + badgeR, midY + 2);
    x += badgeR * 2 + gap;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; zetFont(ctx, 72);
    ctx.fillText(b, x, midY);
  } else {
    // Toernooinaam (wrap) + spelersnamen (wrap)
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    zetFont(ctx, 66);
    const naamRegels = breekRegels(ctx, opts.naam || '', maxW).slice(0, 2);
    let y = div1 + 84;
    for (const rgl of naamRegels) { ctx.fillText(rgl, PAD_X, y); y += 72; }
    // spelers
    y += 6;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    zetFont(ctx, 29, false);
    const spelers = (opts.spelers || []).join('  ·  ');
    for (const rgl of breekRegels(ctx, spelers, maxW).slice(0, 4)) { ctx.fillText(rgl, PAD_X, y); y += 44; }
  }

  // ---- Onder ----
  const onderY = div2 + 30;
  tafelPill(ctx, PAD_X, onderY, `TAFEL ${opts.tafel}`);
  // datum rechts + verwijzing (alleen toernooi)
  ctx.textAlign = 'right'; ctx.fillStyle = GOUD; ctx.textBaseline = 'alphabetic';
  zetFont(ctx, 30, false, 1);
  ctx.fillText(opts.datumLabel || '', W - PAD_X, onderY + 32);
  ctx.letterSpacing = '0px';
  if (opts.type !== 'challenge') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; zetFont(ctx, 22, false);
    ctx.fillText('Wedstrijden & tijden in de beschrijving', W - PAD_X, onderY + 64);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { genereerThumbnail };
