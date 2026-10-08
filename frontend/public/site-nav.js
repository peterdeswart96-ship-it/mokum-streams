// Hamburgermenu rechtsboven, gedeeld door alle PUBLIEKE Mokum Streams-pagina's (Mokum Live,
// Archief, Challenge aanmaken) — het dashboard, keuring en de OBS-pauzeschermen horen hier
// NIET bij: die zijn beheer-only of gaan de uitzending zelf in. Eén bestand, één keer
// includen (<script src="/site-nav.js" defer></script>), werkt zowel op de kale HTML-
// pagina's als op de React-pagina (Challenge) — puur vanilla DOM, buiten React's boom om.
//
// Dubbelt als overzicht van ALLE Mokum-pagina's (niet alleen deze site): elke pagina heeft
// een eigen (lichte) pastelkleur met een donkerder randje in dezelfde tint.
// Namen komen bewust overeen met de <title> van elke pagina.
(function () {
  if (document.getElementById('mokumnav-knop')) return; // dubbele include? niets doen

  var SITES = [
    { href: '/mokumlive/', label: 'Mokum Live', omschrijving: 'Standen en livestreams', kleur: '#d3e4ff', rand: '#7fa9e8' },
    { href: '/archief/', label: 'Mokum Archief', omschrijving: 'Zoek een eerder gespeelde partij', kleur: '#dcf5dc', rand: '#86c986' },
    { href: '/challenge.html', label: 'Mokum Challenge', omschrijving: 'Zelf een challenge inplannen', kleur: '#fff0cc', rand: '#e0b44f' },
  ];
  // Externe links (eigen tab, ander domein) — apart van de interne pagina's hierboven,
  // die zijn wél client-side onderdeel van dit project.
  var EXTERN = [
    { href: 'https://mokum-competitie.pdscloud.nl/', label: 'Mokum Competitie Agenda', omschrijving: 'Wedstrijdschema in je eigen agenda', kleur: '#efe0ff', rand: '#b98be6' },
    { href: 'https://mokum-wachtlijst.pdscloud.nl/', label: 'Mokum Wachtlijst 🔒', omschrijving: 'Afmeldingen & wachtlijst (intern, wachtwoord)', kleur: '#ffe0e8', rand: '#e88ea5' },
    { href: 'https://poolen-amsterdam.nl/', label: 'Mokum-website', omschrijving: 'poolen-amsterdam.nl', kleur: '#d6f6f1', rand: '#6fc9bb' },
    { href: 'https://www.youtube.com/@MokumPoolDarts', label: 'YouTube-kanaal', omschrijving: '@MokumPoolDarts', kleur: '#ffe4d9', rand: '#e8997a' },
  ];

  var stijl = document.createElement('style');
  stijl.textContent = [
    '#mokumnav-knop{position:fixed;top:14px;right:16px;z-index:2147483000;',
    'width:40px;height:40px;border-radius:10px;border:1px solid #2a2a2a;background:#1a1a1a;',
    'color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;',
    'justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.4);}',
    '#mokumnav-knop:hover{border-color:#cc0000;}',
    '#mokumnav-knop[aria-expanded="true"]{border-color:#cc0000;background:#2a2a2a;}',
    '#mokumnav-paneel{position:fixed;top:60px;right:16px;z-index:2147483000;width:320px;',
    'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;',
    'box-shadow:0 12px 32px rgba(0,0,0,.55);font-family:Arial,Helvetica,sans-serif;}',
    '#mokumnav-paneel[hidden]{display:none;}',
    '#mokumnav-paneel .mokumnav-kop{padding:12px 14px;border-bottom:1px solid #2a2a2a;',
    'font-family:"Arial Black",Arial,sans-serif;font-size:13px;color:#fff;',
    'text-transform:uppercase;letter-spacing:.4px;}',
    '#mokumnav-paneel .mokumnav-kop .m{color:#cc0000;}',
    '#mokumnav-paneel .mokumnav-hint{margin-top:4px;font-family:Arial,Helvetica,sans-serif;',
    'font-size:10.5px;font-weight:normal;text-transform:none;letter-spacing:normal;color:#999;}',
    '#mokumnav-paneel .mokumnav-lijst{max-height:70vh;overflow-y:auto;padding:8px;}',
    // Elke pagina een pastel tegel met donkere tekst; de kleur komt per rij uit --kl.
    '#mokumnav-paneel .mokumnav-rij{display:block;padding:10px 14px;margin-bottom:6px;border-radius:9px;',
    'text-decoration:none;background:var(--kl);border:2px solid var(--rand);}',
    '#mokumnav-paneel .mokumnav-rij:last-child{margin-bottom:0;}',
    '#mokumnav-paneel a.mokumnav-rij:hover{filter:brightness(1.07);}',
    '#mokumnav-paneel .mokumnav-rij .tekst{min-width:0;}',
    '#mokumnav-paneel .mokumnav-rij .naam{font-size:14px;color:#14171a;font-weight:bold;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#mokumnav-paneel .mokumnav-rij .omschrijving{font-size:11.5px;color:#3d4348;margin-top:2px;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#mokumnav-paneel .mokumnav-huidig{box-shadow:0 0 0 2px #fff;}',
    '#mokumnav-paneel .mokumnav-scheiding{margin-top:12px;}',
    '#mokumnav-paneel .mokumnav-rij .naam .pijl{color:#5b6168;font-weight:normal;margin-left:4px;}',
  ].join('');
  document.head.appendChild(stijl);

  var knop = document.createElement('button');
  knop.id = 'mokumnav-knop';
  knop.type = 'button';
  knop.setAttribute('aria-haspopup', 'true');
  knop.setAttribute('aria-expanded', 'false');
  knop.setAttribute('aria-label', "Mokum-pagina's");
  knop.title = "Alle Mokum-pagina's";
  knop.textContent = '☰'; // ☰

  var paneel = document.createElement('div');
  paneel.id = 'mokumnav-paneel';
  paneel.hidden = true;

  var kop = document.createElement('div');
  kop.className = 'mokumnav-kop';
  kop.innerHTML = '<span class="m">Mokum</span> — alle pagina\'s';
  paneel.appendChild(kop);

  var lijst = document.createElement('div');
  lijst.className = 'mokumnav-lijst';
  paneel.appendChild(lijst);

  function rijInhoud(site, isHuidig) {
    var tekst = document.createElement('div');
    tekst.className = 'tekst';
    tekst.innerHTML = '<div class="naam">' + site.label + (isHuidig ? ' (huidige pagina)' : (' <span class="pijl">↗</span>'))
      + '</div><div class="omschrijving">' + site.omschrijving + '</div>';
    return [tekst];
  }

  var hier = location.pathname.replace(/index\.html$/, '');
  SITES.forEach(function (site) {
    var isHuidig = hier === site.href || (site.href.endsWith('/') && hier === site.href.slice(0, -1));
    var absoluteHref = location.origin + site.href;
    var el = document.createElement(isHuidig ? 'div' : 'a');
    if (!isHuidig) {
      el.href = site.href;
      el.title = 'Opent ' + absoluteHref;
    }
    el.className = 'mokumnav-rij' + (isHuidig ? ' mokumnav-huidig' : '');
    el.style.setProperty('--kl', site.kleur);
    el.style.setProperty('--rand', site.rand);
    rijInhoud(site, isHuidig).forEach(function (node) { el.appendChild(node); });
    lijst.appendChild(el);
  });
  EXTERN.forEach(function (site, i) {
    var el = document.createElement('a');
    el.href = site.href;
    el.target = '_blank';
    el.rel = 'noopener';
    el.title = 'Opent ' + site.href;
    el.className = 'mokumnav-rij' + (i === 0 ? ' mokumnav-scheiding' : '');
    el.style.setProperty('--kl', site.kleur);
    el.style.setProperty('--rand', site.rand);
    rijInhoud(site, false).forEach(function (node) { el.appendChild(node); });
    lijst.appendChild(el);
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
