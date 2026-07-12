const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const URL = 'https://mokum-streams.pdscloud.nl/mokumlive/?utm_source=stream&utm_medium=qr&utm_campaign=mokumlive';
const outDir = 'C:\\Projects\\mokum-streams\\overlays';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  // 1) Losse PNG (voor wie liever een afbeelding-bron gebruikt)
  await QRCode.toFile(path.join(outDir, 'qr-jumbotron.png'), URL, {
    margin: 2, width: 512, color: { dark: '#0f172a', light: '#ffffff' },
  });

  // 2) Zelfstandige HTML-overlay (QR ingebakken als data-URI + tekst, transparante
  //    achtergrond → direct als OBS browser-source te gebruiken, ook offline).
  const dataUrl = await QRCode.toDataURL(URL, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } });

  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Jumbotron QR</title>
<style>
  html,body{margin:0;background:transparent;font-family:'Segoe UI',system-ui,sans-serif;}
  .card{
    display:inline-flex;align-items:center;gap:20px;
    background:rgba(15,23,42,.88);border:1px solid rgba(255,255,255,.12);
    border-radius:18px;padding:18px 22px;box-shadow:0 8px 30px rgba(0,0,0,.45);
  }
  .qr{background:#fff;border-radius:12px;padding:10px;line-height:0;}
  .qr img{width:150px;height:150px;display:block;}
  .txt{color:#fff;max-width:280px;}
  .title{font-size:30px;font-weight:800;letter-spacing:.5px;line-height:1.05;}
  .sub{font-size:18px;color:#cbd5e1;margin-top:2px;}
  .hint{font-size:15px;color:#34d399;margin-top:12px;font-weight:600;}
</style>
</head>
<body>
  <div class="card">
    <div class="qr"><img src="${dataUrl}" alt="QR Jumbotron"></div>
    <div class="txt">
      <div class="title">Live standen</div>
      <div class="sub">Alle wedstrijden in de zaal</div>
      <div class="hint">📱 Scan &amp; bekijk op je telefoon</div>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'qr-jumbotron.html'), html);

  // README bij de overlay
  const readme = `# QR-overlay — Live standen

Overlay met een QR-code die naar de **Mokum live-standen-pagina** wijst
(\`/standen/\` — alle wedstrijden in de zaal, via Cuescore). Kijkers scannen 'm en zien
de standen op hun telefoon. Zelfde overlay op alle 4 tafels.

QR wijst naar: ${URL}

## Gebruiken in OBS
- **Optie A (aanrader):** \`qr-jumbotron.html\` als **Browser-source** (Local file aanvinken
  → dit bestand kiezen). Zelfstandig (QR ingebakken), transparante achtergrond, met tekst.
  Grootte bijv. 520x220. Positioneer in een hoek.
- **Optie B:** \`qr-jumbotron.png\` als **Image-source** (alleen de QR, tekst er los bij).

## URL wijzigen
Pas \`URL\` in \`overlays/gen-qr.js\` aan en genereer opnieuw (\`node gen-qr.js\` met het
qrcode-pakket), of vervang de QR via een generator.
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);
  // generator meekopiëren zodat 'ie herbruikbaar in de repo staat
  fs.copyFileSync(__filename, path.join(outDir, 'gen-qr.js'));

  console.log('Geschreven naar', outDir, '->', fs.readdirSync(outDir).join(', '));
})();
