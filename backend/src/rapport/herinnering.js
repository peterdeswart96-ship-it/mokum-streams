// Herinnering: speelt er vanavond een toernooi dat niet is ingepland? (#92)
//
// Op 03-08 stond "Mokum MEGA Summer Ranking #27" op niet-ingepland. Daardoor startte het
// systeem niets uit zichzelf, moest iemand het opmerken, en begonnen de uitzendingen ruim
// een half uur te laat. Het ochtendrapport ziet dat pas de volgende dag — dan is het te laat.
//
// Deze module kijkt overdag in de planning en meldt wat er nog moet gebeuren. Puur → testbaar.

// Datum in de zaal (Amsterdam) als 'jjjj-mm-dd'.
const zaalDatum = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const klok = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(d);
};

// Welke toernooien van vandaag hebben nog aandacht nodig?
//
// Bewust NIET meegenomen:
//   - doorlopende competities: die lopen maanden, dus "vandaag" zegt niets. Zou elke dag
//     een mail opleveren en dan leest niemand 'm meer.
//   - toernooien die al live zijn of al klaar: iemand heeft ze met de hand gestart, en
//     daar hoeft geen herinnering meer overheen.
//   - uitgezette toernooien (enabled === false): daar is bewust voor gekozen.
function tekort(items, nu = new Date()) {
  const vandaag = zaalDatum(nu);
  return (items || [])
    .filter((r) => r && r.name)
    .filter((r) => (r.type || 'tournament') !== 'competition')
    .filter((r) => r.date === vandaag)
    .filter((r) => r.enabled !== false && !r.geannuleerd)
    .filter((r) => r.planned !== true)
    .filter((r) => !['live', 'klaar'].includes(String(r.status || '').toLowerCase()))
    .map((r) => ({
      tournamentId: r.tournamentId,
      naam: r.name,
      start: klok(r.startOverride || r.plannedStart),
      tafels: Array.isArray(r.tafels) ? r.tafels : [],
    }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

function onderwerp(lijst) {
  if (!lijst.length) return null;
  const n = lijst.length;
  return n === 1
    ? `Vanavond ${lijst[0].start || ''} — "${lijst[0].naam}" staat nog niet ingepland`.replace('  ', ' ')
    : `${n} toernooien vanavond staan nog niet ingepland`;
}

function tekst(lijst) {
  const r = [];
  r.push('NOG NIET INGEPLAND', '='.repeat(50), '');
  r.push(lijst.length === 1
    ? 'Er speelt vanavond een toernooi dat nog niet is ingepland in het dashboard:'
    : 'Er spelen vanavond toernooien die nog niet zijn ingepland in het dashboard:');
  r.push('');
  for (const t of lijst) {
    r.push(`  ${t.start || 'tijd onbekend'}  ${t.naam}`);
    r.push(`            tafels: ${t.tafels.length ? t.tafels.join(', ') : 'nog niet gekozen'}`);
  }
  r.push('', 'Zolang een toernooi niet is ingepland start het systeem niets uit zichzelf.');
  r.push('Iemand moet dan met de hand elke tafel aanzetten, en dan mist het begin van de avond.');
  r.push('');
  r.push('Inplannen doe je in het dashboard onder Toernooi planner.');
  r.push('https://mokum-streams.pdscloud.nl');
  return r.join('\n');
}

function html(lijst) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rij = (t) => `
    <tr>
      <td style="padding:8px 14px 8px 0;font-family:Consolas,monospace;font-size:14px;color:#6d625e;white-space:nowrap;vertical-align:top;">${esc(t.start || '—')}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0eae9;">
        <div style="font-size:15px;font-weight:600;color:#1b1614;">${esc(t.naam)}</div>
        <div style="font-size:13px;color:#6d625e;">tafels: ${t.tafels.length ? esc(t.tafels.join(', ')) : 'nog niet gekozen'}</div>
      </td>
    </tr>`;

  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#faf8f7;padding:24px 12px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="border-bottom:3px solid #cc0000;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#cc0000;font-weight:bold;">Mokum Pool &amp; Darts · herinnering</div>
      <div style="font-size:22px;font-weight:bold;color:#1b1614;margin-top:6px;">Nog niet ingepland</div>
    </div>

    <p style="font-size:15px;color:#1b1614;margin:0 0 14px;">
      ${lijst.length === 1
        ? 'Er speelt vanavond een toernooi dat nog niet is ingepland in het dashboard.'
        : 'Er spelen vanavond toernooien die nog niet zijn ingepland in het dashboard.'}
    </p>

    <div style="border:1px solid #e6dedc;border-radius:6px;background:#ffffff;padding:4px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${lijst.map(rij).join('')}</table>
    </div>

    <p style="font-size:14px;color:#1b1614;margin:16px 0 0;">
      Zolang een toernooi niet is ingepland start het systeem <strong>niets</strong> uit zichzelf. Iemand moet dan met
      de hand elke tafel aanzetten, en dan mist het begin van de avond.
    </p>

    <p style="margin:18px 0 0;">
      <a href="https://mokum-streams.pdscloud.nl" style="background:#cc0000;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:5px;font-size:15px;font-weight:bold;display:inline-block;">Openen in het dashboard</a>
    </p>

    <div style="font-size:12px;color:#6d625e;margin-top:22px;padding-top:12px;border-top:1px solid #e6dedc;">
      Deze herinnering komt alleen als er echt iets klaarstaat. Is alles ingepland, dan hoor je niets.
    </div>
  </div>
</div>`;
}

function bericht({ lijst, van, aan }) {
  const grens = 'mokum-grens-2c7d';
  return [
    `From: Mokum Streams <${van}>`,
    `To: ${aan.join(', ')}`,
    `Subject: ${onderwerp(lijst)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${grens}"`,
    '',
    `--${grens}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    tekst(lijst),
    '',
    `--${grens}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html(lijst),
    '',
    `--${grens}--`,
    '',
  ].join('\r\n');
}

module.exports = { tekort, onderwerp, tekst, html, bericht, zaalDatum };
