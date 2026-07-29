const { app } = require('@azure/functions');
const { version } = require('../../package.json');

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

    return {
      status: 200,
      jsonBody: {
        service: 'mokum-streams-backend',
        status: 'ok',
        versie: version,
        commit: process.env.DEPLOY_COMMIT || 'onbekend',
        gedeployedOp: process.env.DEPLOY_TIJD || null,
        time: new Date().toISOString()
      }
    };
  }
});
