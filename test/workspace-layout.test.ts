import assert from 'node:assert/strict';
import test from 'node:test';
import {Orientation, type SerializedDockview} from 'dockview';
import {dockPopoutGroups, positionOnScreen, readWorkspaceLayout, workspaceWithoutTransientPanels}
    from '../dist/workspace-layout.js';

test('transient files are removed from the saved layout without removing the other splits', () => {
    const grid: SerializedDockview['grid'] = {
        width: 1000, height: 700, orientation: Orientation.HORIZONTAL,
        root: {type: 'branch', size: 1000, data: [
            {type: 'leaf', size: 350, data: {id: 'left', views: ['code', 'file1', 'yaml'], activeView: 'file1'}},
            {type: 'leaf', size: 500, data: {id: 'right', views: ['stage'], activeView: 'stage'}},
            {type: 'leaf', size: 150, data: {id: 'file-only', views: ['file2'], activeView: 'file2'}}
        ]}
    };
    const result = workspaceWithoutTransientPanels(grid, 'file-only', new Set(['file1', 'file2']), 'code');
    assert.equal(result?.activeGroup, 'left');
    const layout = readWorkspaceLayout(JSON.stringify({...result, version: 1, project: 'A', editingView: 'code',
        panels: {code: {kind: 'sprite', name: 'Sprite', stage: false, section: 0}, stage: {kind: 'stage'},
            yaml: {kind: 'document', providerId: 'provider', documentId: 'example'}}}), 'A');
    assert.deepEqual(layout?.grid.root, {type: 'branch', size: 1000, data: [
        {type: 'leaf', size: 350, data: {id: 'left', views: ['code', 'yaml'], activeView: 'code'}},
        {type: 'leaf', size: 500, data: {id: 'right', views: ['stage'], activeView: 'stage'}}
    ]});
    assert.equal(grid.root.type === 'branch' && grid.root.data.length, 3);
});

const sprite = (name: string) => ({kind: 'sprite', name, stage: false, section: 0});

test('panels in separate windows are saved docked beside their source group with the window position', () => {
    const grid: SerializedDockview['grid'] = {
        width: 1000, height: 700, orientation: Orientation.HORIZONTAL,
        root: {type: 'branch', size: 1000, data: [
            {type: 'leaf', size: 600, data: {id: 'left', views: ['a'], activeView: 'a'}},
            // Dockview hides a group whose only panel moved to a window, keeping its earlier size.
            {type: 'leaf', size: 400, visible: false, data: {id: 'right', views: [], activeView: undefined}},
            {type: 'leaf', size: 0, data: {id: 'unused', views: [], activeView: undefined}}
        ]}
    };
    const docked = dockPopoutGroups(grid, 'popout-group', [
        {gridReferenceGroup: 'right', position: {left: 3000, top: 40, width: 500, height: 400},
            data: {id: 'popout-group', views: ['b'], activeView: 'b'}},
        {gridReferenceGroup: 'gone', data: {id: 'other', views: ['c'], activeView: 'c'}}
    ]);
    assert.equal(docked?.activeGroup, 'right');
    assert.deepEqual(docked?.grid.root, {type: 'branch', size: 1000, data: [
        {type: 'leaf', size: 600, data: {id: 'left', views: ['a', 'c'], activeView: 'a'}},
        {type: 'leaf', size: 400, data: {id: 'right', views: ['b'], activeView: 'b'}}
    ]});
    assert.deepEqual(docked?.popouts, [
        {panels: ['b'], position: {left: 3000, top: 40, width: 500, height: 400}},
        {panels: ['c']}
    ]);
    assert.deepEqual(grid.root.type === 'branch' && grid.root.data[1].data, {id: 'right', views: [], activeView: undefined});

    const layout = readWorkspaceLayout(JSON.stringify({version: 1, project: 'A', grid: docked!.grid,
        activeGroup: docked!.activeGroup, popouts: docked!.popouts, panels: {a: sprite('A'), b: sprite('B'), c: sprite('C')}}), 'A');
    assert.deepEqual(layout?.popouts, docked?.popouts);
});

test('a layout without separate windows has no saved windows', () => {
    const grid: SerializedDockview['grid'] = {width: 800, height: 600, orientation: Orientation.HORIZONTAL,
        root: {type: 'leaf', size: 800, data: {id: 'only', views: ['a'], activeView: 'a'}} as never};
    const docked = dockPopoutGroups(grid, 'only');
    assert.deepEqual(docked, {activeGroup: 'only', popouts: [], grid: {...grid, root: {type: 'branch', size: 800,
        data: [{type: 'leaf', size: 800, data: {id: 'only', views: ['a'], activeView: 'a'}}]}}});
});

test('invalid saved windows reject the whole layout', () => {
    const base = {version: 1, project: 'A', activeGroup: 'g', panels: {a: sprite('A'), s: {kind: 'stage'}},
        grid: {width: 800, height: 600, orientation: Orientation.HORIZONTAL, root: {type: 'branch', size: 800,
            data: [{type: 'leaf', size: 800, data: {id: 'g', views: ['a', 's'], activeView: 'a'}}]}}};
    assert.ok(readWorkspaceLayout(JSON.stringify(base), 'A'));
    for (const popouts of [
        'x', [{panels: []}], [{panels: ['missing']}], [{panels: ['s']}], [{panels: ['a']}, {panels: ['a']}],
        [{panels: ['a'], position: {left: 0, top: 0, width: 0, height: 100}}],
        [{panels: ['a'], position: {left: 'x', top: 0, width: 100, height: 100}}]
    ]) assert.equal(readWorkspaceLayout(JSON.stringify({...base, popouts}), 'A'), undefined, JSON.stringify(popouts));
});

test('a reopened window is moved onto the current screen', () => {
    const screen = {availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875};
    assert.deepEqual(positionOnScreen({left: 3000, top: -500, width: 600, height: 400}, screen),
        {left: 840, top: 25, width: 600, height: 400});
    assert.deepEqual(positionOnScreen({left: 100, top: 100, width: 5000, height: 50}, screen),
        {left: 0, top: 100, width: 1440, height: 150});
});
