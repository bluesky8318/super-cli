import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'server/index': 'src/server/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  splitting: true,
  sourcemap: false,
  // Clean the CLI/Server output but never wipe dist/web (the vite SPA build).
  // tsup always cleans `**/*` plus these patterns; negations exclude web/.
  clean: ['!web', '!web/**'],
  dts: false,
  outDir: 'dist',
  external: ['react', 'react-dom'],
  loader: { '.md': 'text' },
});
