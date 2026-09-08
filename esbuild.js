const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  minify,
  sourcemap: !minify,
};

if (watch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(buildOptions).then(() => {
    console.log('Build complete.');
  }).catch(() => process.exit(1));
}
