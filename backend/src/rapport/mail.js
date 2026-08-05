// Bouwt het ochtendrapport als e-mail (#91). Puur → testbaar.
//
// HTML met inline stijlen: e-mailprogramma's gooien een <style>-blok net zo vaak weg als ze
// het gebruiken, en Outlook is daar het beroerdst in. Alles wat vorm geeft staat daarom op
// het element zelf. Ook een leesbare tekstversie, voor wie de mail op een horloge of in een
// spamfilter ziet.

const { uurNotatie } = require('./duiding');

const KLEUR = {
  goed: '#1f7a4d',
  'let-op': '#a26a10',
  fout: '#b32020',
  neutraal: '#6d625e',
};
const MERK = { goed: 'ging goed', 'let-op': 'let op', fout: 'probleem', neutraal: '' };

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const klok = (d, tz = 'Europe/Amsterdam') =>
  new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);

const datumLang = (datum) => {
  const d = new Date(`${datum}T12:00:00Z`);
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};

// Onderwerpregel: het belangrijkste meteen zichtbaar, zodat je aan de inbox al ziet of je
// moet kijken. Geen "Rapport 2026-08-03" waar niemand iets aan heeft.
function onderwerp(datum, analyse) {
  const foutjes = analyse.bevindingen.filter((b) => b.soort === 'fout').length;
  const kop = foutjes
    ? `${foutjes} aandachtspunt${foutjes === 1 ? '' : 'en'}`
    : 'alles ging vanzelf';
  const v = analyse.cijfers.afgerondeVideos;
  return `Streamavond ${datumLang(datum)} — ${kop}, ${v} video${v === 1 ? '' : "'s"} afgerond`;
}

function tekst(datum, analyse) {
  const r = [];
  r.push(`STREAMAVOND ${datumLang(datum).toUpperCase()}`);
  r.push('='.repeat(60), '');
  r.push('IN HET KORT');
  for (const b of analyse.bevindingen) r.push(`  ${b.soort === 'goed' ? '+' : '!'} ${b.kop}`, `    ${b.tekst}`);
  r.push('', 'CIJFERS');
  const c = analyse.cijfers;
  r.push(`  video's afgerond      : ${c.afgerondeVideos} (${c.hoofdstukken} hoofdstukken)`);
  r.push(`  automatisch gestart   : ${c.automatischGestart}`);
  r.push(`  met de hand gestart   : ${c.handmatigGestart}`);
  r.push(`  automatisch gestopt   : ${c.automatischGestopt}`);
  r.push(`  pauzescherm geschakeld: ${c.pauzeschakelingen}x`);
  r.push('', 'UITZENDINGEN');
  for (const st of c.streams || []) r.push(`  tafel ${st.tafel}  ${st.naam}${st.videoId ? ` — https://youtu.be/${st.videoId}` : ''}`);
  if (!(c.streams || []).length) r.push('  (er is niets uitgezonden)');
  r.push('', 'WAT ER GEBEURDE');
  for (const g of analyse.gebeurtenissen) r.push(`  ${klok(g.tijd)}  ${g.stream ? `[${g.stream}] ` : ''}${g.titel}${g.aantal > 1 ? ` (${g.aantal}x, laatste ${klok(g.laatsteTijd)})` : ''}`, `           ${g.uitleg}`);
  r.push('', `Gebaseerd op ${c.logregels} logregels, venster 12:00-08:00.`);
  return r.join('\n');
}

function html(datum, analyse) {
  const c = analyse.cijfers;
  const doos = 'border:1px solid #e6dedc;border-radius:6px;background:#ffffff;padding:14px 16px;';
  const zacht = 'color:#6d625e;';

  const cijfer = (getal, label) => `
    <td style="padding:0 14px 0 0;vertical-align:top;">
      <div style="font-size:22px;font-weight:bold;color:#1b1614;">${esc(getal)}</div>
      <div style="font-size:12px;${zacht}">${esc(label)}</div>
    </td>`;

  const bevinding = (b) => `
    <div style="${doos}border-left:4px solid ${KLEUR[b.soort] || KLEUR.neutraal};margin-bottom:8px;">
      <div style="font-weight:bold;color:${KLEUR[b.soort] || KLEUR.neutraal};font-size:15px;">${esc(b.kop)}</div>
      <div style="font-size:14px;color:#1b1614;margin-top:4px;">${esc(b.tekst)}</div>
    </div>`;

  // Elke uitzending krijgt een eigen kleur als linkerrand, zodat je in één oogopslag ziet
  // welke regels bij elkaar horen. De naam staat er altijd in tekst bij: kleur mag nooit het
  // enige onderscheid zijn (kleurenblindheid, en zwart-wit uitgeprint).
  const gebeurtenis = (g) => `
    <tr>
      <td style="padding:8px 12px 8px 0;vertical-align:top;white-space:nowrap;font-family:Consolas,monospace;font-size:13px;${zacht}">${esc(klok(g.tijd))}</td>
      <td style="padding:0;width:4px;${g.kleur ? `background:${g.kleur};` : ''}"></td>
      <td style="padding:8px 0 8px 10px;vertical-align:top;border-bottom:1px solid #f0eae9;">
        ${g.stream ? `<div style="font-size:12px;font-weight:bold;color:${g.kleur || '#6d625e'};">${esc(g.stream)}</div>` : ''}
        <div style="font-size:14px;color:#1b1614;font-weight:600;">
          ${esc(g.titel)}${g.aantal > 1 ? esc(` (${g.aantal}x, laatste ${klok(g.laatsteTijd)})`) : ''}
          ${MERK[g.soort] ? `<span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:${KLEUR[g.soort]};font-weight:bold;">&nbsp;·&nbsp;${esc(MERK[g.soort])}</span>` : ''}
        </div>
        <div style="font-size:13px;${zacht}margin-top:2px;">${esc(g.uitleg)}</div>
      </td>
    </tr>`;

  // Legenda: welke uitzending had welke kleur, met tafel en videolink.
  const legenda = (analyse.cijfers.streams || []).map((s) => `
    <div style="display:inline-block;margin:0 14px 6px 0;font-size:12px;">
      <span style="display:inline-block;width:10px;height:10px;background:${s.kleur};vertical-align:middle;border-radius:2px;"></span>
      <span style="color:#1b1614;">&nbsp;Tafel ${esc(s.tafel)} — ${esc(s.naam)}</span>
      ${s.videoId ? `<a href="https://youtu.be/${esc(s.videoId)}" style="color:#6d625e;">&nbsp;↗</a>` : ''}
    </div>`).join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#faf8f7;padding:24px 12px;">
  <div style="max-width:640px;margin:0 auto;">

    <div style="border-bottom:3px solid #cc0000;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#cc0000;font-weight:bold;">Mokum Pool &amp; Darts · streamrapport</div>
      <div style="font-size:24px;font-weight:bold;color:#1b1614;margin-top:6px;">${esc(datumLang(datum))}</div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
      <tr>
        ${cijfer(c.afgerondeVideos, "video's afgerond")}
        ${cijfer(c.hoofdstukken, 'hoofdstukken')}
        ${cijfer(c.automatischGestopt, 'automatisch gestopt')}
        ${cijfer(`${c.pauzeschakelingen}x`, 'pauzescherm')}
      </tr>
    </table>

    <div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;${zacht}margin-bottom:8px;">In het kort</div>
    ${analyse.bevindingen.map(bevinding).join('')}

    <div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;${zacht}margin:24px 0 8px;">Uitzendingen</div>
    <div style="${doos}margin-bottom:14px;">${legenda || '<span style="font-size:13px;color:#6d625e;">Er is vannacht niets uitgezonden.</span>'}</div>

    <div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;${zacht}margin:24px 0 8px;">Wat er gebeurde</div>
    <div style="${doos}padding:4px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${analyse.gebeurtenissen.map(gebeurtenis).join('') || '<tr><td style="padding:12px 0;font-size:14px;">Er is vannacht niets gebeurd dat het vermelden waard is.</td></tr>'}
      </table>
    </div>

    <div style="font-size:12px;${zacht}margin-top:20px;padding-top:12px;border-top:1px solid #e6dedc;">
      Alle tijden zijn Amsterdamse tijd. Gebaseerd op ${esc(c.logregels)} logregels over het venster 12:00–08:00,
      zodat een avond die na middernacht doorloopt in één overzicht blijft.
      Deze mail wordt elke ochtend automatisch verstuurd.
    </div>

  </div>
</div>`;
}

// Complete mail in het formaat dat curl aan een SMTP-server voert.
function bericht({ datum, analyse, van, aan }) {
  const grens = 'mokum-grens-8a3f';
  const kop = [
    `From: Mokum Streams <${van}>`,
    `To: ${aan.join(', ')}`,
    `Subject: ${onderwerp(datum, analyse)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${grens}"`,
    '',
  ];
  return [
    ...kop,
    `--${grens}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    tekst(datum, analyse),
    '',
    `--${grens}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html(datum, analyse),
    '',
    `--${grens}--`,
    '',
  ].join('\r\n');
}

module.exports = { onderwerp, tekst, html, bericht, datumLang };
