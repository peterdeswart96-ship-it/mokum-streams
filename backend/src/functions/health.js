const { app } = require('@azure/functions');

// Eenvoudige HTTP-endpoint die als "levensteken" van de backend dient.
// Doel: bevestigen dat de Azure Functions v4-runtime draait en dat de
// CI-build (npm ci) daadwerkelijk iets bouwt. Dit is het skelet-startpunt
// (issue #7); de echte functies (YouTube-wrapper #8, broadcasts #9) komen hierna.
//
// Aanroep lokaal: GET http://localhost:7071/api/health
// In het v4-programmeermodel registreer je een functie met app.http(...);
// er zijn géén losse function.json-bestanden meer nodig.
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
        time: new Date().toISOString()
      }
    };
  }
});
