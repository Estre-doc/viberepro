import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await vite({
  configFile: false,
  plugins: [{
    name: 'browser-only-icons',
    // This output is entirely client-side. React's server/client boundary hint
    // has no meaning here; strip it before the browser-only IIFE is bundled.
    transform(code, id) {
      if (id.replaceAll('\\', '/').includes('/lucide-react/')) return code.replace(/^["']use client["'];?\s*/m, '');
    }
  }],
  build: {
    outDir: 'dist/report-ui', emptyOutDir: true, target: 'es2022',
    lib: { entry: 'report-ui/main.tsx', name: 'VibeReproReport', formats: ['iife'], fileName: () => 'report-ui.iife.js', cssFileName: 'report-ui' },
    minify: true
  },
  define: { 'process.env.NODE_ENV': '"production"' }
});
await esbuild({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', target: 'node22', format: 'esm',
  packages: 'external', banner: { js: '#!/usr/bin/env node' }, sourcemap: true });
await esbuild({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external', sourcemap: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'dist', '--rootDir', 'src', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', 'src/index.ts'], { stdio: 'inherit' });
await chmod('dist/cli.js', 0o755);
