const { app } = require('@azure/functions');
const leden = require('../challenge/leden');
const cuescore = require('../challenge/cuescore');
const { maakToken, leesToken, tokenUitRequest } = require('../challenge/token');
const { haalSleutel } = require('../challenge/kluis');

// Endpoints waarmee Mokum-LEDEN een challenge in Cuescore aanmaken (#90).
// Zie docs/api-contract.md v0.48 en docs/cuescore-challenge.md.
//
// Let op het verschil met /api/manage/*: daar is één gedeeld beheerderstoken, hier logt
// elk lid in met zijn eigen Cuescore-gegevens en krijgt een eigen token terug.
//
// Wachtwoorden komen in dit bestand alleen voorbij in de login-handler en gaan van daar
// rechtstreeks naar leden.koppel(). Ze worden NOOIT gelogd, ook niet bij een fout.

const json = (status, body) => ({ status, jsonBody: body });

// Het geheim waarmee we lidtokens ondertekenen.
//
// Bewust dezelfde sleutel als de kluis: die staat in productie ALLEEN in Key Vault, niet in
// een omgevingsvariabele. token.js valt terug op process.env, en dat is er in Azure niet —
// daardoor gaf elke tokencontrole een 500 in plaats van een 401 (gezien bij de eerste
// live-controle, 02-08). Daarom halen we 'm hier expliciet op en geven we 'm mee.
const tokenGeheim = () => haalSleutel();

// Haalt het lid bij het meegestuurde token. Retour: { id, record } of null.
async function ledUitRequest(request) {
  const claim = leesToken(tokenUitRequest(request), { s: await tokenGeheim() });
  if (!claim) return null;
  const record = await leden.lees(claim.ledId);
  return record ? { id: claim.ledId, record } : null;
}

// Wrapper voor alles wat een ingelogd lid vereist: scheelt in elke handler dezelfde
// vier regels, en zorgt dat een ontbrekend token overal hetzelfde 401 oplevert.
function metLid(handler) {
  return async (request, context) => {
    const lid = await ledUitRequest(request);
    if (!lid) return json(401, { error: 'niet ingelogd', opnieuwInloggen: true });
    return handler(lid, request, context);
  };
}

// Een geldige Cuescore-sessie, of een nette 401 als het lid opnieuw moet koppelen.
async function sessieOfFout(lid) {
  const s = await leden.sessie(lid.id, lid.record);
  if (!s.ok) return { fout: json(401, { error: 'Cuescore-koppeling werkt niet meer', opnieuwInloggen: true }) };
  return { cookies: s.cookies };
}

// POST /api/challenge/login — koppelen met Cuescore-gegevens
app.http('challengeLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'challenge/login',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'ongeldige JSON' }); }

    const email = String((body && body.email) || '').trim();
    const wachtwoord = String((body && body.wachtwoord) || '');
    if (!email || !wachtwoord) return json(400, { error: 'e-mailadres en wachtwoord zijn verplicht' });

    const r = await leden.koppel(email, wachtwoord);
    if (!r.ok) {
      // Alleen het e-mailadres in de log — nooit het wachtwoord, ook niet gedeeltelijk.
      context.log(`[challenge/login] mislukt voor ${email}: ${r.melding}`);
      return json(401, { error: r.melding || 'inloggen bij Cuescore is niet gelukt' });
    }
    context.log(`[challenge/login] gekoppeld: ${email}`);
    return json(200, {
      token: maakToken(r.ledId, { s: await tokenGeheim() }),
      lid: leden.publiek(r.record),
      tafels: cuescore.CAMERA_TAFELS,
    });
  },
});

// GET /api/challenge/me — wie ben ik en wat zijn mijn sjablonen
app.http('challengeMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'challenge/me',
  handler: metLid(async (lid) => json(200, {
    lid: leden.publiek(lid.record),
    tafels: cuescore.CAMERA_TAFELS,
    alleTafels: Object.keys(cuescore.TAFELS).map(Number).sort((a, b) => a - b),
  })),
});

// GET /api/challenge/spelers?q= — tegenstander zoeken
app.http('challengeSpelers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'challenge/spelers',
  handler: metLid(async (lid, request) => {
    const q = (request.query.get('q') || '').trim();
    if (q.length < 2) return json(200, { spelers: [] });
    const s = await sessieOfFout(lid);
    if (s.fout) return s.fout;
    return json(200, { spelers: await cuescore.zoekSpelers(s.cookies, q) });
  }),
});

// POST /api/challenge/aanmaken — de eigenlijke actie
app.http('challengeAanmaken', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'challenge/aanmaken',
  handler: metLid(async (lid, request, context) => {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'ongeldige JSON' }); }

    const tegenstanderId = Number(body && body.tegenstanderId);
    const tafel = Number(body && body.tafel);
    if (!Number.isFinite(tegenstanderId) || tegenstanderId <= 0) return json(400, { error: 'kies een tegenstander' });
    if (!cuescore.TAFELS[tafel]) return json(400, { error: `onbekende tafel: ${body && body.tafel}` });

    const s = await sessieOfFout(lid);
    if (s.fout) return s.fout;

    let r;
    try {
      r = await cuescore.maakChallenge(s.cookies, {
        tegenstanderId,
        tafel,
        discipline: body.discipline,
        raceTo: body.raceTo,
        breakrule: body.breakrule,
      });
    } catch (e) {
      context.log(`[FOUT] [challenge/aanmaken] tafel ${tafel}: ${e.message}`);
      return json(502, { error: `Cuescore: ${e.message}` });
    }
    if (!r.ok) return json(502, { error: r.melding });

    context.log(`[challenge/aanmaken] tafel ${tafel}: challenge ${r.challengeId} (match ${r.matchId})`);
    await leden.schrijf(lid.id, { ...lid.record, laatstGebruikt: new Date().toISOString() });
    return json(200, r);
  }),
});

// POST /api/challenge/sjablonen — sjablonen opslaan
app.http('challengeSjablonen', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'challenge/sjablonen',
  handler: metLid(async (lid, request) => {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'ongeldige JSON' }); }
    const sjablonen = await leden.bewaarSjablonen(lid.id, lid.record, body && body.sjablonen);
    return json(200, { sjablonen });
  }),
});

// POST /api/challenge/loskoppelen — alles van dit lid wissen
app.http('challengeLoskoppelen', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'challenge/loskoppelen',
  handler: metLid(async (lid, request, context) => {
    await leden.ontkoppel(lid.id);
    context.log(`[challenge/loskoppelen] record gewist voor ${lid.record.email}`);
    return json(200, { ok: true });
  }),
});
