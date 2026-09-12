import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'report/reporter': 'src/report/reporter.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node20',
  shims: true,
})
