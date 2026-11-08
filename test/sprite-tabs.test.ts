import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import {mountSpriteTabs} from '../dist/sprite-tabs.js';

function setupDom(t: TestContext) {
    const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
    const globals = {
        window: dom.window,
        document: dom.window.document,
        Node: dom.window.Node,
        ResizeObserver: class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    };
    Object.assign(globalThis, globals);
    t.after(() => {
        dom.window.close();
        for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
    });
    return dom.window.document;
}

test('sprite tabs reuse the native editor, preserve its selected section, and follow the project', t => {
    const document = setupDom(t);
    const sprite = (id: string, name: string) => ({
        id, name, isOriginal: true, isStage: false, getName() { return this.name; }
    });
    const first = sprite('first', 'First');
    const second = sprite('second', 'Second');
    const vm = Object.assign(new EventEmitter(), {
        runtime: {targets: [first, second]},
        editingTarget: first,
        setEditingTarget(id: string) {
            this.editingTarget = this.runtime.targets.find(target => target.id === id);
            this.emit('targetsUpdate');
        }
    });
    const root = document.querySelector('main');
    const content = document.createElement('div');
    let section = 0;
    let selected = '';
    const controller = mountSpriteTabs(root, content, {vm, getSection: () => section,
        activateSection: next => { section = next; }, selectTarget: id => { selected = id; }, resize() {},
        reopenLabel: 'Reopen selected sprite'});
    try {
        const tab = (title: string) => [...root.querySelectorAll<HTMLElement>('.dv-tab')]
            .find(node => node.textContent.includes(title));
        assert.ok(tab('First'));
        assert.ok(tab('Second'));
        const firstSlot = content.parentElement;
        section = 1;
        controller.select(second.id);
        assert.equal(vm.editingTarget, second);
        assert.equal(selected, second.id);
        assert.equal(section, 1);
        assert.notEqual(content.parentElement, firstSlot);
        section = 2;
        vm.setEditingTarget(first.id);
        assert.equal(content.parentElement, firstSlot);
        assert.equal(section, 1);

        second.name = 'Renamed';
        vm.emit('targetsUpdate');
        assert.ok(tab('Renamed'));
        controller.select(second.id);
        assert.equal(section, 2);
        tab('Renamed').querySelector<HTMLElement>('.dv-default-tab-action').click();
        assert.equal(vm.editingTarget, first);
        assert.equal(tab('Renamed'), undefined);
        controller.select(second.id);
        assert.ok(tab('Renamed'));
        assert.equal(section, 2);

        const replacement = sprite(first.id, 'New project sprite');
        vm.runtime.targets = [replacement];
        vm.setEditingTarget(replacement.id);
        assert.equal(selected, replacement.id);
        assert.ok(tab('New project sprite'));
        assert.equal(root.querySelectorAll('.dv-tab').length, 1);

        tab('New project sprite').querySelector<HTMLElement>('.dv-default-tab-action').click();
        assert.equal(selected, '');
        vm.emit('targetsUpdate');
        assert.equal(root.querySelectorAll('.dv-tab').length, 0);
        controller.select(replacement.id);
        assert.ok(root.contains(content));
    } finally {
        controller.dispose();
    }
    assert.equal(vm.listenerCount('targetsUpdate'), 0);
});

test('a project with many sprites opens them as tabs in one group, not as split columns', t => {
    const document = setupDom(t);
    const sprite = (id: string) => ({id, isOriginal: true, isStage: false, getName: () => id});
    const stage = {id: 'stage', isOriginal: true, isStage: true, getName: () => 'Stage'};
    const sprites = ['a', 'b', 'c', 'd'].map(sprite);
    const vm = Object.assign(new EventEmitter(), {
        runtime: {targets: [stage, ...sprites]},
        editingTarget: sprites[2],
        setEditingTarget(id: string) {
            this.editingTarget = this.runtime.targets.find(target => target.id === id);
            this.emit('targetsUpdate');
        }
    });
    const root = document.querySelector('main');
    const controller = mountSpriteTabs(root, document.createElement('div'), {vm, getSection: () => 0,
        activateSection() {}, selectTarget() {}, resize() {}, reopenLabel: 'Reopen'});
    try {
        const groups = () => [...root.querySelectorAll('.dv-groupview')]
            .map(group => [...group.querySelectorAll('.dv-default-tab-content')].map(tab => tab.textContent));
        assert.deepEqual(groups(), [['a', 'b', 'c', 'd']]);
        assert.equal(root.querySelector('.dv-tab.dv-active-tab .dv-default-tab-content')?.textContent, 'c');

        vm.runtime.targets.push(sprite('e'));
        vm.emit('targetsUpdate');
        assert.deepEqual(groups(), [['a', 'b', 'c', 'd', 'e']]);
    } finally {
        controller.dispose();
    }
});

test('the backdrop tab uses the editor locale and sprite tabs keep their names', t => {
    const document = setupDom(t);
    const root = document.querySelector('main');
    const content = document.createElement('div');
    const stage = {id: 'stage', isOriginal: true, isStage: true, getName: () => 'Stage'};
    const sprite = {id: 'sprite', isOriginal: true, isStage: false, getName: () => 'Stage'};
    const vm = Object.assign(new EventEmitter(), {
        runtime: {targets: [stage, sprite]},
        editingTarget: sprite,
        setEditingTarget(id: string) {
            this.editingTarget = this.runtime.targets.find(target => target.id === id);
            this.emit('targetsUpdate');
        }
    });
    for (const [locale, title] of [['ja-JP', '背景'], ['en', 'Backdrops']]) {
        vm.editingTarget = sprite;
        const controller = mountSpriteTabs(root, content, {
            vm, locale, getSection: () => 0, activateSection() {}, selectTarget() {}, resize() {}, reopenLabel: 'Reopen'
        });
        try {
            const titles = () => [...root.querySelectorAll('.dv-default-tab-content')].map(tab => tab.textContent);
            assert.deepEqual(titles(), ['Stage']);
            controller.select(stage.id);
            assert.equal(vm.editingTarget, stage);
            assert.deepEqual(titles(), ['Stage', title]);
            vm.emit('targetsUpdate');
            assert.deepEqual(titles(), ['Stage', title]);
        } finally {
            controller.dispose();
        }
    }
});

test('split views of one sprite preserve their own editor state and release it when closed', t => {
    const document = setupDom(t);
    const icon = {encodeDataURI: () => '/sprite.svg'};
    const sprite = {id: 'sprite', isOriginal: true, isStage: false, getName: () => 'Sprite',
        getCurrentCostume: () => ({asset: icon})};
    const vm = Object.assign(new EventEmitter(), {
        runtime: {targets: [sprite]},
        editingTarget: sprite,
        setEditingTarget() { throw new Error('Splitting a sprite must not change the VM target'); }
    });
    const root = document.querySelector('main');
    const content = document.createElement('div');
    let section = 0;
    let position = 'origin';
    let inactiveActions = 0;
    let assets: Parameters<Parameters<typeof mountSpriteTabs>[2]['selectTarget']>[1];
    const firstSound = {};
    const secondSound = {};
    const disposed: string[] = [];
    const controller = mountSpriteTabs(root, content, {
        vm, multiView: true, getSection: () => section, activateSection: next => { section = next; },
        selectTarget(id, selections) { assets = selections; }, resize() {}, reopenLabel: 'Reopen',
        viewAdapter: {
            capture: () => position,
            renderInactive(body, view, snapshot: string | undefined) {
                const state = document.createElement('span');
                state.dataset.viewId = view.id;
                state.textContent = snapshot;
                state.addEventListener('click', () => { inactiveActions++; });
                body.append(state);
                return () => state.remove();
            },
            restore(view, snapshot) {
                position = snapshot ?? 'default';
            },
            dispose(view, snapshot) { disposed.push(snapshot); }
        }
    });
    try {
        const original = controller.currentView();
        position = 'left-position';
        assets.sounds.remember(sprite, secondSound);
        section = 1;
        const right = controller.split('right');
        assert.ok(right && right !== original.id);
        assert.equal(controller.currentView().id, right);
        assert.equal(controller.currentView().targetId, original.targetId);
        assert.equal(controller.currentView().section, 1);
        assert.equal(assets.sounds.restore(sprite, [secondSound, firstSound]), 0);
        assets.sounds.remember(sprite, firstSound);
        assert.equal(assets.sounds.restore({...sprite}, [firstSound]), undefined);
        assert.equal(root.querySelectorAll('.dv-groupview').length, 2);
        assert.equal(root.querySelectorAll('img[src="/sprite.svg"]').length, 2);
        assert.equal(root.querySelector('[data-view-id="sprite"]').textContent, 'left-position');

        controller.setViewSection(right, 2);
        position = 'right-position';
        root.querySelector('[data-view-id="sprite"]').dispatchEvent(
            new document.defaultView.Event('click', {bubbles: true}));
        assert.equal(controller.currentView().id, original.id);
        assert.equal(inactiveActions, 0);
        assert.equal(section, 1);
        assert.equal(position, 'left-position');
        assert.equal(assets.sounds.restore(sprite, [firstSound, secondSound]), 1);
        assert.equal(assets.costumes.restore(sprite, [firstSound, secondSound]), undefined);

        assert.equal(controller.activateView(right), true);
        assert.equal(section, 2);
        assert.equal(position, 'right-position');
        assert.equal(assets.sounds.restore(sprite, [firstSound, secondSound]), 0);
        controller.setViewSection(right, 0);
        assert.equal(position, 'default');
        position = 'code-position';
        controller.setViewSection(right, 2);
        assert.equal(position, 'right-position');
        const below = controller.split('below');
        assert.equal(root.querySelectorAll('.dv-groupview').length, 3);
        assert.equal(controller.currentView().id, below);
        assert.equal(controller.closeSplit(below), true);
        assert.equal(controller.closeSplit(right), true);
        assert.equal(controller.closeSplit(), false);
        assert.equal(controller.currentView().id, original.id);
        assert.equal(controller.views().length, 1);
        assert.equal(section, 1);
        assert.equal(position, 'left-position');
        assert.ok(disposed.includes('right-position'));
    } finally {
        controller.dispose();
    }
    assert.equal(vm.listenerCount('targetsUpdate'), 0);
});

test('the message section is reachable only when the host renders it', t => {
    const document = setupDom(t);
    const sprite = {id: 'sprite', isOriginal: true, isStage: false, getName: () => 'Sprite',
        getCurrentCostume: () => ({asset: {encodeDataURI: () => '/sprite.svg'}})};
    const vm = Object.assign(new EventEmitter(), {runtime: {targets: [sprite]}, editingTarget: sprite});
    const root = document.querySelector('main');
    let slots: {kind: string}[] = [];
    const mount = (options: object) => mountSpriteTabs(root, document.createElement('div'), {
        vm, multiView: true, getSection: () => 0, activateSection() {}, selectTarget() {}, resize() {},
        reopenLabel: 'Reopen', onAssetPreviewSlots: next => { slots = [...next]; }, ...options
    });

    const native = mount({});
    try {
        const {id} = native.currentView();
        assert.equal(native.setViewSection(id, 3), false);
        assert.equal(native.setViewSection(id, 4), false);
        assert.equal(native.setViewSection(id, 2), true);
    } finally {
        native.dispose();
    }

    const both = mount({variables: true, messages: true});
    try {
        const {id} = both.currentView();
        assert.equal(both.setViewSection(id, 3), true);
        assert.deepEqual(slots.map(slot => slot.kind), ['variables']);
        assert.equal(both.setViewSection(id, 4), true);
        assert.deepEqual(slots.map(slot => slot.kind), ['messages']);
        assert.equal(both.setViewSection(id, 5), false);
        assert.equal(both.currentView().section, 4);
    } finally {
        both.dispose();
    }

    const messagesOnly = mount({messages: true});
    try {
        const {id} = messagesOnly.currentView();
        assert.equal(messagesOnly.setViewSection(id, 3), false);
        assert.equal(messagesOnly.setViewSection(id, 4), true);
        assert.deepEqual(slots.map(slot => slot.kind), ['messages']);
    } finally {
        messagesOnly.dispose();
    }
});

test('returning the active view to a native section hides the variables and messages pane', t => {
    const document = setupDom(t);
    const sprite = {id: 'sprite', isOriginal: true, isStage: false, getName: () => 'Sprite',
        getCurrentCostume: () => ({asset: {encodeDataURI: () => '/sprite.svg'}})};
    const vm = Object.assign(new EventEmitter(), {runtime: {targets: [sprite]}, editingTarget: sprite});
    const root = document.querySelector('main');
    let slots: {kind: string}[] = [];
    const controller = mountSpriteTabs(root, document.createElement('div'), {
        vm, multiView: true, variables: true, messages: true, getSection: () => 0, activateSection() {},
        selectTarget() {}, resize() {}, reopenLabel: 'Reopen', onAssetPreviewSlots: next => { slots = [...next]; }
    });
    const pane = () => root.querySelector<HTMLElement>('.tw-plus-sprite-tab-asset-preview');
    try {
        const {id} = controller.currentView();
        for (const [section, kind] of [[3, 'variables'], [4, 'messages']] as const) {
            for (const native of [0, 1, 2]) {
                assert.equal(controller.setViewSection(id, section), true);
                assert.deepEqual(slots.map(slot => slot.kind), [kind]);
                assert.equal(pane().hidden, false);
                // The native editor takes the pane's place; a pane left visible pushes it out of view.
                assert.equal(controller.setViewSection(id, native), true);
                assert.deepEqual(slots, []);
                assert.equal(pane().hidden, true, `${kind} pane stays visible after section ${native}`);
            }
        }
    } finally {
        controller.dispose();
    }
});
