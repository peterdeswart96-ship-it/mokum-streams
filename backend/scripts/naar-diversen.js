#!/usr/bin/env node
// Ruimt de streams-tab van het kanaal op: zet video's op VERBORGEN en hangt ze in een
// playlist (standaard "Diversen"). Bedoeld voor naamloze en mislukte uitzendingen die op
// youtube.com/@MokumPoolDarts/streams alleen maar in de weg staan.
//
// Waarom allebei: een playlist verplaatst niets. De streams-tab toont álle OPENBARE video's
// die ooit een livestream waren, ongeacht playlists. Alleen de zichtbaarheid haalt ze daar
// weg. We kiezen VERBORGEN (unlisted) en niet privé, want een verborgen video in een
// openbare playlist blijft gewoon te bekijken — op privé zou niemand er meer bij kunnen.
//
// Nodig: toegang tot Key Vault kv-mokum-streams (az login) of de env-vars
// YOUTUBE_CLIENT_ID/_SECRET/_REFRESH_TOKEN. Zie backend/src/youtube/secrets.js.
//
// Draaien — eerst kijken, dan pas doen:
//   node backend/scripts/naar-diversen.js                      # proefdraai, verandert niets
//   node backend/scripts/naar-diversen.js --doen               # voert het uit
//   node backend/scripts/naar-diversen.js --videos <id>,<id>   # losse video's i.p.v. groepen
//   node backend/scripts/naar-diversen.js --herstel <bestand>  # draait een eerdere run terug
//
// Invoer is thumbnail-status.json (van thumbnail-status.js), of met --videos een handjevol
// id's dat je zelf aanwijst — voor het geval dat iemand vergeet een uitzending te stoppen en
// er een stream van tien uur op het kanaal staat. Elke uitgevoerde run schrijft een
// herstelbestand met de vorige zichtbaarheid per video, zodat alles terug te draaien is.

const fs = require('fs');
const path = require('path');
const { getYouTubeClient } = require('../src/youtube/client');

const args = process.argv.slice(2);
const heeft = (v) => args.includes(v);
const waarde = (v, standaard) => { const i = args.indexOf(v); return i >= 0 && args[i + 1] ? args[i + 1] : standaard; };

const DOEN = heeft('--doen');
const HERSTEL = waarde('--herstel', null);
const PLAYLIST_NAAM = waarde('--playlist', 'Diversen');
const BRON = waarde('--bron', 'thumbnail-status.json');

// Welke groepen uit thumbnail-status.json mee mogen, plus losse titels die er niet in vallen.
// Met --videos <id,id> pak je losse video's, ook als ze niet in thumbnail-status.json staan:
// dat is het geval bij een uitzending die iemand vergeten is te stoppen en die daarna uren
// heeft doorgelopen. Dan is --groepen niet van toepassing en wil je gewoon deze ene weg.
const LOSSE_IDS = (waarde('--videos', '')).split(',').map((s) => s.trim()).filter(Boolean);
const GROEPEN = LOSSE_IDS.length
  ? (waarde('--groepen', '')).split(',').map((s) => s.trim()).filter(Boolean)
  : (waarde('--groepen', 'test,naamloos')).split(',').map((s) => s.trim()).filter(Boolean);
const LOSSE_TITELS = LOSSE_IDS.length ? [] : ['5 juli 2025', 'Tafel 1 Straight pool'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── YouTube-hulpjes ───────────────────────────────────────────────────────────

// Zoekt de playlist op naam; maakt 'm aan als hij nog niet bestaat.
async function playlistZoekOfMaak(yt, naam) {
  let pageToken;
  do {
    const r = await yt.playlists.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken });
    const hit = (r.data.items || []).find((p) => p.snippet.title.toLowerCase() === naam.toLowerCase());
    if (hit) return { id: hit.id, nieuw: false };
    pageToken = r.data.nextPageToken;
  } while (pageToken);

  if (!DOEN) return { id: null, nieuw: true };
  const r = await yt.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: naam, description: 'Losse en naamloze uitzendingen, niet zichtbaar op de streams-tab.' },
      status: { privacyStatus: 'public' },
    },
  });
  return { id: r.data.id, nieuw: true };
}

// Video-id's die al in de playlist zitten — zo is een tweede run niet schadelijk.
async function playlistInhoud(yt, playlistId) {
  const set = new Set();
  if (!playlistId) return set;
  let pageToken;
  do {
    const r = await yt.playlistItems.list({ part: ['contentDetails'], playlistId, maxResults: 50, pageToken });
    for (const i of r.data.items || []) set.add(i.contentDetails.videoId);
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return set;
}

// De hele status opvragen. Bij videos.update geldt: wat je in een opgegeven part weglaat,
// wordt gewist. We sturen 'm dus compleet terug met alleen privacyStatus gewijzigd.
async function huidigeStatus(yt, videoId) {
  const r = await yt.videos.list({ part: ['status'], id: [videoId] });
  const v = (r.data.items || [])[0];
  return v ? v.status : null;
}

async function zetZichtbaarheid(yt, videoId, nieuw) {
  const st = await huidigeStatus(yt, videoId);
  if (!st) throw new Error(`video ${videoId} niet gevonden`);
  if (st.privacyStatus === nieuw) return { overgeslagen: true, vorige: st.privacyStatus };
  await yt.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status: {
        privacyStatus: nieuw,
        embeddable: st.embeddable,
        license: st.license,
        publicStatsViewable: st.publicStatsViewable,
        selfDeclaredMadeForKids: st.madeForKids === true,
      },
    },
  });
  return { overgeslagen: false, vorige: st.privacyStatus };
}

// ── Terugdraaien ──────────────────────────────────────────────────────────────

async function herstel(bestand) {
  const log = JSON.parse(fs.readFileSync(bestand, 'utf8'));
  const yt = await getYouTubeClient();
  let n = 0;
  for (const r of log.videos || []) {
    if (!r.vorigeZichtbaarheid || r.vorigeZichtbaarheid === 'unlisted') continue;
    await zetZichtbaarheid(yt, r.videoId, r.vorigeZichtbaarheid);
    console.log(`terug  ${r.videoId}  → ${r.vorigeZichtbaarheid}  ${r.titel}`);
    n += 1;
    await sleep(200);
  }
  console.log(`\n${n} video's teruggezet. De playlist-vermeldingen zijn blijven staan (die schaden niet).`);
}

// ── Hoofdprogramma ────────────────────────────────────────────────────────────

(async () => {
  if (HERSTEL) return herstel(HERSTEL);

  // thumbnail-status.json is alleen nodig als we met groepen of titels werken. Bij --videos
  // kunnen we rechtstreeks aan de slag; de titel halen we dan bij YouTube op.
  const heeftBron = fs.existsSync(BRON);
  if (!heeftBron && (GROEPEN.length || LOSSE_TITELS.length)) {
    console.error(`${BRON} niet gevonden. Draai eerst: node backend/scripts/thumbnail-status.js`);
    process.exit(1);
  }
  const status = heeftBron ? JSON.parse(fs.readFileSync(BRON, 'utf8')) : { groepen: {} };

  // Selectie samenstellen: hele groepen + losse titels + expliciet opgegeven video's.
  const gekozen = new Map();
  for (const g of GROEPEN) {
    for (const r of status.groepen[g] || []) gekozen.set(r.videoId, { ...r, waarom: g });
  }
  for (const rijen of Object.values(status.groepen)) {
    for (const r of rijen) {
      if (LOSSE_TITELS.includes((r.naam || '').trim())) gekozen.set(r.videoId, { ...r, waarom: 'losse titel' });
    }
  }
  if (LOSSE_IDS.length) {
    const yt = await getYouTubeClient();
    const res = await yt.videos.list({ part: ['snippet'], id: LOSSE_IDS });
    const gevonden = new Map((res.data.items || []).map((v) => [v.id, v.snippet]));
    for (const id of LOSSE_IDS) {
      const s = gevonden.get(id);
      if (!s) { console.error(`video ${id} bestaat niet of is niet van dit kanaal — overgeslagen`); continue; }
      gekozen.set(id, {
        videoId: id, naam: s.title,
        datum: (s.publishedAt || '').slice(0, 10), waarom: 'handmatig opgegeven',
      });
    }
  }
  const selectie = [...gekozen.values()].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

  console.log(`Playlist: ${PLAYLIST_NAAM}`);
  console.log(`Groepen : ${GROEPEN.join(', ')} + ${LOSSE_TITELS.length} losse titels`);
  console.log(`Selectie: ${selectie.length} video's\n`);
  for (const r of selectie) console.log(`  ${r.datum || '?'}  ${r.videoId}  ${(r.naam || '').slice(0, 60)}`);

  if (!DOEN) {
    console.log(`\nPROEFDRAAI — er is niets gewijzigd. Draai met --doen om het uit te voeren.`);
    console.log(`Quota-inschatting: ~${selectie.length * 101} eenheden van de 10.000 per dag.`);
    return;
  }

  const yt = await getYouTubeClient();
  const pl = await playlistZoekOfMaak(yt, PLAYLIST_NAAM);
  console.log(`\nPlaylist ${pl.nieuw ? 'aangemaakt' : 'gevonden'}: ${pl.id}`);
  const alIn = await playlistInhoud(yt, pl.id);

  const logboek = { moment: new Date().toISOString(), playlist: { naam: PLAYLIST_NAAM, id: pl.id }, videos: [] };
  let gedaan = 0, fouten = 0;

  for (const r of selectie) {
    try {
      if (!alIn.has(r.videoId)) {
        await yt.playlistItems.insert({
          part: ['snippet'],
          requestBody: { snippet: { playlistId: pl.id, resourceId: { kind: 'youtube#video', videoId: r.videoId } } },
        });
      }
      const res = await zetZichtbaarheid(yt, r.videoId, 'unlisted');
      logboek.videos.push({ videoId: r.videoId, titel: r.naam, vorigeZichtbaarheid: res.vorige, waarom: r.waarom });
      console.log(`OK   ${r.videoId}  ${res.vorige} → unlisted  ${(r.naam || '').slice(0, 50)}`);
      gedaan += 1;
    } catch (e) {
      fouten += 1;
      console.log(`FOUT ${r.videoId}  ${e.message}`);
      if (/quota/i.test(e.message)) { console.log('Quota op — de rest kan morgen.'); break; }
    }
    await sleep(250);
  }

  const uit = `diversen-${logboek.moment.slice(0, 19).replace(/[:T]/g, '')}.json`;
  fs.writeFileSync(uit, JSON.stringify(logboek, null, 2), 'utf8');
  console.log(`\n${gedaan} verwerkt, ${fouten} fout. Herstelbestand: ${path.resolve(uit)}`);
  console.log(`Terugdraaien: node backend/scripts/naar-diversen.js --herstel ${uit}`);
})();
