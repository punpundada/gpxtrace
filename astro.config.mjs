import { defineConfig, passthroughImageService } from 'astro/config';

export default defineConfig({
  // shortcut: placeholder GitHub Pages origin, replace `username` with your GitHub username
  site: 'https://username.github.io',
  base: '/gpxtrace',
  output: 'static',
  image: {
    service: passthroughImageService(),
  },
});
