// @ts-check
import { defineConfig } from 'astro/config';

// Site 100 % statique, publié sur GitHub Pages.
export default defineConfig({
  site: 'https://edgarm44.github.io',
  base: '/Nexora',
  trailingSlash: 'ignore',
});
