// Build a self-contained production bundle in dist/.
//
// The game has no bundler step: the browser loads ES modules directly and
// Three.js is vendored under public/vendor. "Building" means copying the
// server and static assets into a clean directory with its own package.json so
// it can be deployed without the development dependencies or test files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const dir of ['public', 'server']) {
  fs.cpSync(path.join(root, dir), path.join(dist, dir), { recursive: true });
}

for (const file of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

console.log('🍕 Built production bundle in dist/');
console.log('   Run it with: cd dist && npm ci --omit=dev && npm start');
