import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Scenes are JSX that renders to strings (kit/jsx-runtime.ts): no framework plugin
const kit = fileURLToPath(new URL('../kit', import.meta.url))
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'stageshow-js' },
  resolve: { alias: [{ find: /^stageshow-js\/(.*)$/, replacement: `${kit}/$1` }] },
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', fs: { allow: ['..'] } },
})
