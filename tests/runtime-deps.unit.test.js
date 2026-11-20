import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));

function packageName(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:') || isBuiltin(specifier)) {
    return null;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function serverRuntimeImports() {
  const serverDir = join(repoRoot, 'server');
  const names = new Set();
  for (const file of readdirSync(serverDir).filter((entry) => entry.endsWith('.js'))) {
    const source = readFileSync(join(serverDir, file), 'utf8');
    for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
      const name = packageName(match[1]);
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

test('every bare import in server/ is a production dependency', () => {
  const declared = packageJson.dependencies ?? {};
  const missing = serverRuntimeImports().filter((name) => !(name in declared));
  assert.deepEqual(missing, []);
});

test('server runtime packages are not marked dev-only in the lockfile', () => {
  for (const name of ['express-rate-limit', 'firebase-admin']) {
    const entry = lockfile.packages?.[`node_modules/${name}`];
    assert.ok(entry, `missing lockfile entry for ${name}`);
    assert.notEqual(entry.dev, true, `${name} is dev-only in the lockfile`);
  }
});
