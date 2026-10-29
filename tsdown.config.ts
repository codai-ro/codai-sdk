import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  fixedExtension: false,
  // Top-level `sourcemap` would otherwise also stamp a `sourceMappingURL=index.d.ts.map`
  // into the d.ts; tsup shipped declarations without a map.
  dts: { sourcemap: false },
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
  plugins: [
    {
      // rolldown-plugin-dts inherits the top-level `sourcemap`, appends
      // `//# sourceMappingURL=index.d.ts.map` to the d.ts, then deletes the map
      // file (dts.sourcemap is false). Drop the dangling reference, as tsup did.
      name: 'strip-dts-sourcemap-url',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.fileName.endsWith('.d.ts')) {
            chunk.code = chunk.code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
          }
        }
      },
    },
  ],
});
