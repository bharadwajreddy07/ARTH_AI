import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Treat .js files containing JSX the same as .jsx
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },

  // Needed so esbuild can handle JSX inside .js during dependency pre-bundling
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  // Vite root is the frontend folder (where index.html lives)
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
});
