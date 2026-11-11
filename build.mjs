// Bundles src/app.js for the Electron window.
// The API key comes from the git-ignored .env file, so it never sits in source.
import { build } from 'esbuild';

await build({
    entryPoints: ['src/app.js'],
    bundle: true,
    outfile: 'dist/app.bundle.js',
    platform: 'browser',
    format: 'iife',
    logLevel: 'warning',
    define: {
        'process.env.SMARTSPECTRA_API_KEY': JSON.stringify(process.env.SMARTSPECTRA_API_KEY || ''),
    },
});
