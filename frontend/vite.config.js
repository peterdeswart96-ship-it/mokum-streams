import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' past bij een custom domain (mokum-streams.pdscloud.nl). Wordt het
// dashboard onder username.github.io/mokum-streams/ gehost, zet base dan op
// '/mokum-streams/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Alleen voor `npm run dev`: stuurt /api door naar de echte backend. Nodig om de pagina op een
  // telefoon in het eigen netwerk te testen — de backend laat alleen localhost en de echte
  // site toe als herkomst, dus vanaf http://<ip-van-je-pc>:5173 zou elke aanroep geweigerd
  // worden. Via dit doorgeefluik komt de aanvraag van de dev-server zelf, zonder die controle.
  // Start dan met een lege VITE_API_BASE, zodat de pagina /api op zichzelf aanroept.
  server: {
    proxy: {
      '/api': { target: 'https://mokum-streams-func.azurewebsites.net', changeOrigin: true },
    },
  },
  build: {
    // Twee losse pagina's in plaats van één app met routes: het dashboard (index.html,
    // voor beheerders) en de challenge-pagina (challenge.html, voor leden). Losse
    // ingangen omdat GitHub Pages geen server-side routing kent — met client-side routes
    // geeft een harde reload op /challenge een 404. Nu is het gewoon een bestand.
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        challenge: new URL('./challenge.html', import.meta.url).pathname,
      },
    },
  },
});
