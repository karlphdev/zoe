import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/zoe/',
  plugins: [
    {
      // Les copies brutes des modèles (≈ 170 Mo) restent en dev mais ne partent pas en prod.
      name: 'drop-model-sources',
      apply: 'build',
      closeBundle() {
        rmSync(resolve(import.meta.dirname, 'dist/models/source'), { recursive: true, force: true });
      },
    },
  ],
});
