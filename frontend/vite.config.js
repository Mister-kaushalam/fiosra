import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

function stripWorkerSourcemap() {
  return {
    name: 'strip-worker-sourcemap',
    generateBundle(options, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (fileName.includes('pdf.worker') && file.type === 'asset') {
          file.source = file.source
            .toString()
            .replace(/\/\/# sourceMappingURL=pdf\.worker\.mjs\.map/g, '');
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), stripWorkerSourcemap()],
  base: './',
  build: {
    outDir: '../ui-ux/frontend-dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/courses': 'http://localhost:8000',
      '/events': 'http://localhost:8000',
      '/dialogue': 'http://localhost:8000',
      '/evidence': 'http://localhost:8000',
      '/assignments': 'http://localhost:8000',
      '/authoring': 'http://localhost:8000',
      '/materials': 'http://localhost:8000',
      '/learning-documents': 'http://localhost:8000',
      '/learning-canvas': 'http://localhost:8000',
      '/knowledge': 'http://localhost:8000',
      '/concept-graph': 'http://localhost:8000',
      '/healthz': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/api': 'http://localhost:8000',
    },
  },
})

