// Syntax-checks every JavaScript file in the app and confirms the packaged page references files that exist.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = ['electron', 'renderer/js', 'scripts', 'tests'].flatMap(dir =>
  fs.readdirSync(path.join(root, dir)).filter(name => /\.(c?js)$/.test(name)).map(name => path.join(root, dir, name))
);
let failed = 0;
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed++;
    console.error(`Syntax error in ${path.relative(root, file)}:\n${error.stderr}`);
  }
}
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
  if (!fs.existsSync(path.join(root, 'renderer', ref))) {
    failed++;
    console.error(`renderer/index.html references a missing file: ${ref}`);
  }
}
for (const css of fs.readdirSync(path.join(root, 'renderer', 'styles'))) {
  const text = fs.readFileSync(path.join(root, 'renderer', 'styles', css), 'utf8');
  if (/@import|url\(\s*['"]?https?:/.test(text.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    failed++;
    console.error(`renderer/styles/${css} loads something from the network.`);
  }
}
console.log(failed ? `${failed} problem(s) found.` : `Checked ${sources.length} scripts and the page's file references: OK.`);
process.exit(failed ? 1 : 0);
