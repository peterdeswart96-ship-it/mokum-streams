// Hamburgermenu rechtsboven, gedeeld door alle PUBLIEKE Mokum Streams-pagina's (Mokum Live,
// Archief, Challenge aanmaken) — het dashboard, keuring en de OBS-pauzeschermen horen hier
// NIET bij: die zijn beheer-only of gaan de uitzending zelf in. Eén bestand, één keer
// includen (<script src="/site-nav.js" defer></script>), werkt zowel op de kale HTML-
// pagina's als op de React-pagina (Challenge) — puur vanilla DOM, buiten React's boom om.
//
// Vervangt de losse "← Live"/"🔎 Archief"-linkjes die er eerst stonden: één plek voor alle
// kruislinks, schaalt vanzelf mee als er ooit een vierde publieke pagina bijkomt.
(function () {
  if (document.getElementById('mokumnav-knop')) return; // dubbele include? niets doen

  var SITES = [
    { href: '/mokumlive/', label: 'Mokum Live', omschrijving: 'Standen en livestreams' },
    { href: '/archief/', label: 'Archief', omschrijving: 'Zoek een eerder gespeelde partij' },
    { href: '/challenge.html', label: 'Challenge aanmaken', omschrijving: 'Zelf een challenge inplannen' },
  ];
  // Externe links (eigen tab, ander domein) — apart van de interne pagina's hierboven,
  // die zijn wél client-side onderdeel van dit project.
  var EXTERN = [
    { href: 'https://poolen-amsterdam.nl/', label: 'Mokum-website', omschrijving: 'poolen-amsterdam.nl' },
    { href: 'https://www.youtube.com/@MokumPoolDarts', label: 'YouTube-kanaal', omschrijving: '@MokumPoolDarts' },
  ];

  var stijl = document.createElement('style');
  stijl.textContent = [
    '#mokumnav-knop{position:fixed;top:14px;right:16px;z-index:2147483000;',
    'width:40px;height:40px;border-radius:10px;border:1px solid #2a2a2a;background:#1a1a1a;',
    'color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;',
    'justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.4);}',
    '#mokumnav-knop:hover{border-color:#cc0000;}',
    '#mokumnav-knop[aria-expanded="true"]{border-color:#cc0000;background:#2a2a2a;}',
    '#mokumnav-paneel{position:fixed;top:60px;right:16px;z-index:2147483000;width:240px;',
    'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;',
    'box-shadow:0 12px 32px rgba(0,0,0,.55);font-family:Arial,Helvetica,sans-serif;}',
    '#mokumnav-paneel[hidden]{display:none;}',
    '#mokumnav-paneel .mokumnav-kop{padding:12px 14px;border-bottom:1px solid #2a2a2a;',
    'font-family:"Arial Black",Arial,sans-serif;font-size:13px;color:#fff;',
    'text-transform:uppercase;letter-spacing:.4px;}',
    '#mokumnav-paneel .mokumnav-kop .m{color:#cc0000;}',
    '#mokumnav-paneel a{display:block;padding:10px 14px;text-decoration:none;',
    'border-bottom:1px solid #232323;}',
    '#mokumnav-paneel a:last-child{border-bottom:0;}',
    '#mokumnav-paneel a:hover{background:#232323;}',
    '#mokumnav-paneel a .naam{font-size:14px;color:#fff;font-weight:bold;}',
    '#mokumnav-paneel a .omschrijving{font-size:11.5px;color:#999;margin-top:2px;}',
    '#mokumnav-paneel .mokumnav-huidig{padding:10px 14px;border-bottom:1px solid #232323;',
    'cursor:default;}',
    '#mokumnav-paneel .mokumnav-huidig .naam{font-size:14px;color:#ff6b6b;font-weight:bold;}',
    '#mokumnav-paneel .mokumnav-huidig .omschrijving{font-size:11.5px;color:#999;margin-top:2px;}',
    '#mokumnav-paneel .mokumnav-scheiding{border-top:1px solid #2a2a2a;}',
    '#mokumnav-paneel a .naam .pijl{color:#666;font-weight:normal;margin-left:4px;}',
  ].join('');
  document.head.appendChild(stijl);

  var knop = document.createElement('button');
  knop.id = 'mokumnav-knop';
  knop.type = 'button';
  knop.setAttribute('aria-haspopup', 'true');
  knop.setAttribute('aria-expanded', 'false');
  knop.setAttribute('aria-label', "Mokum Streams-pagina's");
  knop.textContent = '☰'; // ☰

  var paneel = document.createElement('div');
  paneel.id = 'mokumnav-paneel';
  paneel.hidden = true;

  var kop = document.createElement('div');
  kop.className = 'mokumnav-kop';
  kop.innerHTML = '<span class="m">Mokum</span> Streams';
  paneel.appendChild(kop);

  var hier = location.pathname.replace(/index\.html$/, '');
  SITES.forEach(function (site) {
    var isHuidig = hier === site.href || (site.href.endsWith('/') && hier === site.href.slice(0, -1));
    var el = document.createElement(isHuidig ? 'div' : 'a');
    if (!isHuidig) el.href = site.href;
    el.className = isHuidig ? 'mokumnav-huidig' : '';
    el.innerHTML = '<div class="naam">' + site.label + (isHuidig ? ' (huidige pagina)' : '') + '</div>'
      + '<div class="omschrijving">' + site.omschrijving + '</div>';
    paneel.appendChild(el);
  });
  EXTERN.forEach(function (site, i) {
    var el = document.createElement('a');
    el.href = site.href;
    el.target = '_blank';
    el.rel = 'noopener';
    if (i === 0) el.className = 'mokumnav-scheiding';
    el.innerHTML = '<div class="naam">' + site.label + '<span class="pijl">↗</span></div>'
      + '<div class="omschrijving">' + site.omschrijving + '</div>';
    paneel.appendChild(el);
  });

  function sluit() {
    paneel.hidden = true;
    knop.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    var open = !paneel.hidden;
    if (open) { sluit(); return; }
    paneel.hidden = false;
    knop.setAttribute('aria-expanded', 'true');
  }
  knop.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  document.addEventListener('click', function (e) {
    if (!paneel.hidden && !paneel.contains(e.target) && e.target !== knop) sluit();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sluit(); });

  document.body.appendChild(knop);
  document.body.appendChild(paneel);
})();
