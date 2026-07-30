const { app } = require('@azure/functions');
const { version } = require('../../package.json');

// De stempel van de laatste deploy. Komt uit src/deploy-info.json — dat bestand wordt
// per deploy geschreven (`npm run stamp`, ook door de CI-workflow) en hoort dus bij
// precies de code die hier draait. De app-settings DEPLOY_COMMIT/DEPLOY_TIJD zijn nog
// slechts een terugval voor een deploy zonder stempel.
//
// De volgorde is met opzet zo. Andersom ging het mis: een app-setting van een eerdere
// handmatige deploy bleef staan en overschreeuwde elke volgende deploy, waardoor health
// 133d321 bleef melden terwijl 2a215f3 draaide. Een instelling die je één keer zet
// veroudert; een bestand in het pakket kan dat per definitie niet.
function deployStempel() {
  let uitBestand = {};
  try {
    uitBestand = require('../deploy-info.json');
  } catch {
    uitBestand = {}; // niet gestempeld → val terug op de app-settings
  }
  return {
    commit: uitBestand.commit || process.env.DEPLOY_COMMIT || 'onbekend',
    tijd: uitBestand.tijd || process.env.DEPLOY_TIJD || null,
  };
}

// Eenvoudige HTTP-endpoint die als "levensteken" van de backend dient.
// Doel: bevestigen dat de Azure Functions v4-runtime draait en dat de
// CI-build (npm ci) daadwerkelijk iets bouwt. Dit is het skelet-startpunt
// (issue #7); de echte functies (YouTube-wrapper #8, broadcasts #9) komen hierna.
//
// Aanroep lokaal: GET http://localhost:7071/api/health
// In het v4-programmeermodel registreer je een functie met app.http(...);
// er zijn géén losse function.json-bestanden meer nodig.
//
// #79 — WELKE code draait hier? Op Linux Consumption draait de app vanuit een
// pakket; je kunt er van buitenaf niet in kijken. Zonder dit antwoord is "de fix
// staat live" een aanname, en precies die aanname kostte ons de finales van 27 en
// 28 juli: de CI meldde groen terwijl de backend nooit gedeployed werd. Daarom
// geeft health nu de commit terug waarmee gedeployed is (app-setting DEPLOY_COMMIT,
// gezet door de deploy-stap). Staat er 'onbekend', dan is er gedeployed zonder
// stempel — behandel dat als "ik weet niet wat hier draait".
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (request, context) => {
    context.log('Health-check aangeroepen');

    const stempel = deployStempel();

    return {
      status: 200,
      jsonBody: {
        service: 'mokum-streams-backend',
        status: 'ok',
        versie: version,
        commit: stempel.commit,
        gedeployedOp: stempel.tijd,
        time: new Date().toISOString()
      }
    };
  }
});
