import { defineConfig } from 'tsup';

export default defineConfig((options) => [
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: !options.watch,
  },
  {
    entry: ['src/react.tsx'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    external: ['react'],
    banner: {
      js: "'use client';",
    },
  },
]);
