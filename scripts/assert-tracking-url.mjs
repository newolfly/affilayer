// Build-time assertion (audit C-2): the built bundle must point tracking
// at go.affilayer.com and must never contain the localhost:3001 fallback.
// Runs as the web app's `postbuild` step — a bad build fails loudly
// instead of shipping dead tracking links. Also asserts the Supabase
// URL/key are baked in when they were set for the build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const failures = [];
const found = new Set();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    const text = readFileSync(p, 'utf8');
    if (text.includes('localhost:3001')) failures.push(`localhost:3001 in ${p}`);
    if (text.includes('go.affilayer.com')) found.add('go.affilayer.com');
    for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      const v = process.env[key];
      if (v && text.includes(v)) found.add(key);
    }
  }
}

try {
  walk(dist);
} catch (err) {
  console.error(`assert-tracking-url: cannot read dist/ (${err.message})`);
  process.exit(1);
}

for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (process.env[key] && !found.has(key)) failures.push(`${key} value not found in dist/`);
}
if (!found.has('go.affilayer.com')) failures.push('go.affilayer.com not found in dist/');

if (failures.length > 0) {
  for (const f of failures) console.error(`assert-tracking-url: FAIL ${f}`);
  process.exit(1);
}
console.log('assert-tracking-url: ok (go.affilayer.com present, no localhost:3001)');
