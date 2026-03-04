import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  noExternal: [/@modelcontextprotocol\/sdk/, /zod/],
  splitting: false,
  sourcemap: false,
  dts: false,
  minify: true,
})
