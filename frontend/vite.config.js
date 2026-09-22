import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
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
  plugins: [tailwindcss(), svelte(), stripWorkerSourcemap()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/courses': 'http://localhost:8080',
      '/events': 'http://localhost:8080',
      '/dialogue': 'http://localhost:8080',
      '/evidence': 'http://localhost:8080',
      '/assignments': 'http://localhost:8080',
      '/authoring': 'http://localhost:8080',
      '/materials': 'http://localhost:8080',
      '/learning-documents': 'http://localhost:8080',
      '/learning-canvas': 'http://localhost:8080',
      '/knowledge': 'http://localhost:8080',
      '/concept-graph': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
    },
  },
})

