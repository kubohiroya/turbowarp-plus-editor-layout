import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import test from 'node:test';

// The package supports React 16.14 (peerDependencies), and TurboWarp Plus Editor mounts it in the
// GUI's React 16. APIs added in React 17 or later are undefined there and throw at render time,
// which the browser tests on this repository's React 18 cannot catch.
const newerApis = /\b(?:useId|useSyncExternalStore|useInsertionEffect|useTransition|useDeferredValue|startTransition|useOptimistic|useActionState|useFormStatus)\b|react-dom\/client/;

test('sources use only React APIs available in the supported React 16.14', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.peerDependencies.react, '>=16.14');
    const directory = new URL('../src/', import.meta.url);
    const found: string[] = [];
    for (const entry of await readdir(directory, {recursive: true, withFileTypes: true})) {
        if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
        const file = new URL(`${entry.parentPath.slice(directory.pathname.length)}/${entry.name}`.replace(/^\//, ''), directory);
        const lines = (await readFile(file, 'utf8')).split('\n');
        lines.forEach((line, index) => {
            if (newerApis.test(line)) found.push(`${file.pathname.slice(directory.pathname.length)}:${index + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(found, []);
});
