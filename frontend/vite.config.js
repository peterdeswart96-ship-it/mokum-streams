import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/' past bij een custom domain (mokum-streams.pdscloud.nl). Wordt het
// dashboard onder username.github.io/mokum-streams/ gehost, zet base dan op
// '/mokum-streams/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
