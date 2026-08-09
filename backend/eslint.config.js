const globals = require('globals');

// Codecontrole vóór het deployen. Dit is géén stijlpolitie — er staat bewust niets in over
// inspringen, aanhalingstekens of puntkomma's. Het gaat om één soort fout: code die niet
// kán werken, maar er bij het lezen prima uitziet.
//
// De aanleiding (09-08-2026): in `liveMatches.js` was de schrijfregel omgezet naar
// `writeJsonAlsGewijzigd` maar de import bovenaan niet. Het bestand laadde netjes — een
// ontbrekende import valt pas om bij het AANROEPEN. Gevolg: de timer viel 76 keer achter
// elkaar om tijdens een lopend toernooi en de standen stonden 75 minuten stil. `no-undef`
// had dat in één seconde gevonden, vóór de deploy.
//
// Draaien:  npm run lint        (draait ook in de CI bij elke push)

module.exports = [
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // Node 18+ heeft fetch/AbortSignal ingebouwd; `globals.node` kent ze nog niet
        // allemaal, en zonder deze regel zou no-undef er ten onrechte over klagen.
        fetch: 'readonly',
        AbortSignal: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // ── De reden dat dit bestand bestaat ──────────────────────────────────
      // Een naam gebruiken die nergens is gedefinieerd of geïmporteerd.
      'no-undef': 'error',

      // ── Andere fouten die pas tijdens het draaien opvallen ────────────────
      'no-dupe-keys': 'error',         // twee keer dezelfde sleutel in een object: de laatste wint stil
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',       // code na een return die nooit draait
      'no-const-assign': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-cond-assign': 'error',       // `if (a = 1)` waar `if (a === 1)` bedoeld was
      'no-constant-condition': 'error',
      'use-isnan': 'error',            // `x === NaN` is altijd onwaar
      'valid-typeof': 'error',

      // BEWUST UIT: `require-atomic-updates`. Die klaagt over ons cache-patroon
      // (`if (cached) return cached; ... cached = await ...`), dat op negen plekken bewust
      // zo staat: YouTube-client, Key Vault-secrets, de Cuescore-cache, de browser voor de
      // thumbnails. In een Functions-proces is het ergste gevolg dat het werk één keer
      // dubbel gebeurt. Negen meldingen die allemaal geen fout zijn, maken de controle
      // waardeloos — dan kijkt niemand er meer naar.

      // ── Waarschuwing, geen fout ───────────────────────────────────────────
      // Een ongebruikte variabele is meestal onschuldig, maar wijst soms op een
      // half afgemaakte wijziging — precies zoals hierboven. Als waarschuwing, zodat
      // hij de deploy niet tegenhoudt maar wel opvalt.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // De code binnen `page.evaluate(...)` draait niet in Node maar IN de browser die
  // Puppeteer opstart om de thumbnail te renderen. Daar bestaan `document` en
  // `getComputedStyle` wél. Zonder deze uitzondering meldt no-undef ze als niet-bestaand,
  // en dat is precies de melding die we serieus willen kunnen nemen.
  {
    files: ['src/video/thumbnailHtml.js'],
    languageOptions: {
      globals: { document: 'readonly', getComputedStyle: 'readonly' },
    },
  },
];
