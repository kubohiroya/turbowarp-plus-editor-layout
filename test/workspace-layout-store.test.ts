import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {createWorkspaceLayoutStore, workspaceLayoutDatabase} from '../dist/workspace-layout-store.js';
import type {WorkspaceProjectIdentity} from '../dist/workspace-layout-store.js';

/** Stands in for a FileSystemHandle: IndexedDB keeps its fields, and isSameEntry compares the entry it points to. */
class Handle {
    kind = 'file';
    name: string;
    entry: string;
    constructor(name: string, entry: string) {
        this.name = name;
        this.entry = entry;
    }
    async isSameEntry(other: {entry?: string}) { return other.entry === this.entry; }
}

const file = (name: string, entry = name): WorkspaceProjectIdentity =>
    ({kind: 'file', name, handle: new Handle(name, entry) as unknown as FileSystemHandle});

function setup(options: {limit?: number; maxBytes?: number} = {}) {
    const indexedDB = new IDBFactory();
    let time = 0;
    const removed: string[] = [];
    const store = createWorkspaceLayoutStore({indexedDB, ...options, now: () => ++time,
        legacyStorage: {removeItem: key => { removed.push(key); }}});
    async function records() {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(workspaceLayoutDatabase);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const all = await new Promise<{name: string; layout: string; signature: string}[]>((resolve, reject) => {
            const request = database.transaction('layouts').objectStore('layouts').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return all;
    }
    return {store, records, removed};
}

test('each sb3 file keeps its own layout, even beside another file of the same name', async () => {
    const {store, records} = setup();
    const first = await store.open(file('Project.sb3', '/a/Project.sb3'), 'sprites');
    assert.equal(first.layout, undefined);
    assert.equal(first.saved, false);
    await first.write('layout of a', 'sprites');
    const second = await store.open(file('Project.sb3', '/b/Project.sb3'), 'sprites');
    assert.equal(second.layout, undefined, 'a file of the same name is another project');
    await second.write('layout of b', 'sprites');

    const reopened = await store.open(file('Project.sb3', '/a/Project.sb3'), 'renamed sprites');
    assert.equal(reopened.layout, 'layout of a');
    assert.equal(reopened.exact, true, 'the file was found by its handle, not by its sprites');
    assert.equal(reopened.saved, true);
    assert.equal((await records()).length, 2);
});

test('a project keeps one record while its sprites and layout change', async () => {
    const {store, records} = setup();
    const session = await store.open({kind: 'anonymous', name: 'Game'}, 'one sprite');
    await session.write('first', 'one sprite');
    await session.write('second', 'two sprites');
    assert.deepEqual((await records()).map(record => [record.layout, record.signature]), [['second', 'two sprites']]);
});

test('a project without a file is found only by its name and sprites together', async () => {
    const {store} = setup();
    await (await store.open({kind: 'anonymous', name: 'Game'}, 'sprites')).write('saved', 'sprites');
    assert.equal((await store.open({kind: 'anonymous', name: 'Game'}, 'other sprites')).layout, undefined);
    assert.equal((await store.open({kind: 'anonymous', name: 'Other'}, 'sprites')).layout, undefined);
    const found = await store.open({kind: 'anonymous', name: 'Game'}, 'sprites');
    assert.equal(found.layout, 'saved');
    assert.equal(found.exact, false);
});

test('the desktop app finds a project by the key of its path', async () => {
    const {store} = setup();
    await (await store.open({kind: 'desktop', name: 'Game.sb3', key: 'path-a'}, 'sprites')).write('desktop', 'sprites');
    assert.equal((await store.open({kind: 'desktop', name: 'Renamed.sb3', key: 'path-b'}, 'sprites')).layout, undefined);
    const found = await store.open({kind: 'desktop', name: 'Game.sb3', key: 'path-a'}, 'changed');
    assert.equal(found.layout, 'desktop');
    assert.equal(found.exact, true);
});

test('only the most recently used projects keep their layout', async () => {
    const {store, records} = setup({limit: 3});
    for (const name of ['a', 'b', 'c']) await (await store.open(file(name), '')).write(name, '');
    // Opening a project counts as using it, even when its layout stays as it was.
    await store.open(file('a'), '');
    await (await store.open(file('d'), '')).write('d', '');
    assert.deepEqual((await records()).map(record => record.name).sort(), ['a', 'c', 'd']);
    await (await store.open(file('e'), '')).write('e', '');
    assert.deepEqual((await records()).map(record => record.name).sort(), ['a', 'd', 'e']);
});

test('a layout larger than the limit is not saved', async () => {
    const {store, records} = setup({maxBytes: 8});
    const session = await store.open(file('a'), '');
    await session.write('123456789', '');
    assert.equal(session.saved, false);
    assert.deepEqual(await records(), []);
});

test('the tab position is one preference for every project', async () => {
    const {store} = setup();
    assert.equal(await store.readTabsPosition(), undefined);
    await store.writeTabsPosition('left');
    assert.equal(await store.readTabsPosition(), 'left');
});

test('the single layout of earlier versions is cleared, not moved', () => {
    const {removed} = setup();
    assert.deepEqual(removed, ['twPlusDockviewLayout', 'twPlusDockviewLayout.tabs']);
});

test('without IndexedDB, opening a project fails so the editor keeps its default layout', async () => {
    const store = createWorkspaceLayoutStore({indexedDB: undefined, legacyStorage: null});
    await assert.rejects(store.open({kind: 'anonymous', name: ''}, ''));
});
