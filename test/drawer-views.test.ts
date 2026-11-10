import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {availableDrawerViews, hasDrawerBar, readDrawerView, writeDrawerView} from '../src/drawer-views.ts';

const memoryStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return {values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }};
};

test('the selected drawer view is saved beside the layout and read back only when valid', () => {
    const storage = memoryStorage();
    assert.equal(readDrawerView(storage, 'layout'), 'sprites');
    writeDrawerView(storage, 'layout', 'git-history');
    assert.equal(storage.values.get('layout.drawer'), '{"version":1,"view":"git-history"}');
    assert.equal(readDrawerView(storage, 'layout'), 'git-history');
    storage.values.set('layout.drawer', '{"version":1,"view":"agents"}');
    assert.equal(readDrawerView(storage, 'layout'), 'sprites');
    storage.values.set('layout.drawer', '{');
    assert.equal(readDrawerView(storage, 'layout'), 'sprites');
    assert.equal(readDrawerView(null, 'layout'), 'sprites');
    assert.equal(readDrawerView(storage, undefined), 'sprites');
    assert.doesNotThrow(() => writeDrawerView({getItem: () => null, setItem() { throw new Error('denied'); }}, 'layout', 'project'));
});

test('host views are kept in button order without unknown or repeated ids', () => {
    const render = () => null;
    const views = availableDrawerViews({views: [
        {id: 'git-history', render, label: 'first'}, {id: 'sprites' as never, render}, {id: 'other' as never, render},
        {id: 'project', render}, {id: 'git-history', render, label: 'second'}, {id: 'project', render: undefined as never}
    ]});
    assert.deepEqual(views.map(view => [view.id, view.label]), [['project', undefined], ['git-history', 'first']]);
    assert.equal(hasDrawerBar(undefined), false);
    assert.equal(hasDrawerBar({views: []}), false);
    assert.equal(hasDrawerBar({agents: {renderMenu: render}}), true);
});

async function mountDrawer(t, {locale = 'ja', storage = memoryStorage()} = {}) {
    const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
    const globals = {window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true};
    Object.assign(globalThis, globals);
    const React = await import('react');
    const {act} = React;
    const {createRoot} = await import('react-dom/client');
    const {createPortal} = await import('react-dom');
    const {createStandardLayout} = await import('../src/standard-layout.ts');
    const h = React.createElement;
    const styles = new Proxy({}, {get: (_, key) => String(key)});
    const context = React.createContext({});
    const {StandardLayout, TargetLayout, SpritePropertiesSection, useSpriteListTools} =
        createStandardLayout(React, {styles, targetStyles: styles, context, LayoutMenu: () => null});
    let mounts = 0;
    function SpriteList() {
        const {mount, renderTools} = useSpriteListTools();
        React.useLayoutEffect(() => { mounts++; }, []);
        const tools = renderTools(null);
        return h(React.Fragment, null, mount ? createPortal(tools, mount) : tools, h('ul', {'data-sprite-list': ''}));
    }
    const root = createRoot(dom.window.document.querySelector('main')!);
    t.after(() => {
        act(() => root.unmount());
        dom.window.close();
        for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
    });
    const render = drawerViews => act(() => root.render(h(StandardLayout, {
        enabled: true, splitter: false, windowLayout: false, stageActionEnabled: false, locale,
        defaultStageWidth: 340, defaultStageHeight: 180, stageAspect: 4 / 3,
        storage, storageKey: 'layout', drawerViews,
        render: () => h('div', null, h(TargetLayout, {compact: false, render: () => h('div', {className: 'target-pane'},
            h(SpritePropertiesSection, {inEditor: true, fallback: null}), h(SpriteList))}))
    })));
    const document = dom.window.document;
    const button = (name: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
    const key = (target: Element, key: string) => act(() => {
        target.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    });
    const click = (target: HTMLElement) => act(() => target.click());
    return {React, h, document, storage, render, button, key, click, mounts: () => mounts};
}

const views = (h, {project = true, git = true, agents = true} = {}) => ({
    views: [
        project && {id: 'project', render: () => h('p', {'data-project': ''}, 'files'),
            tools: () => h('button', {type: 'button', 'aria-label': 'Refresh'})},
        git && {id: 'git-history', render: () => h('p', {'data-history': ''}, 'commits')}
    ].filter(Boolean),
    agents: agents ? {renderMenu: ({close}) => h('div', {role: 'menu'},
        h('button', {type: 'button', role: 'menuitem', onClick: close}, 'ChatGPT'),
        h('button', {type: 'button', role: 'menuitem'}, 'Claude'))} : undefined
});

test('without host views the drawer shows only the sprite list, exactly as before', async t => {
    const {document, render} = await mountDrawer(t);
    render(undefined);
    assert.equal(document.querySelector('[role="toolbar"]'), null);
    const panel = document.querySelector('.edgePanel')!;
    assert.equal(panel.firstElementChild?.className, 'target-pane');
    assert.ok(document.querySelector('[aria-label="スプライト一覧の操作"]'));
    render({views: []});
    assert.equal(document.querySelector('[role="toolbar"]'), null);
});

test('every view keeps the pin button, which pins the drawer itself', async t => {
    const {document, h, render, button, click} = await mountDrawer(t);
    render(views(h));
    const drawer = () => document.querySelector('[data-pinned]');
    assert.ok(drawer(), 'the drawer starts pinned');
    for (const view of ['プロジェクトフォルダ', 'Git 履歴']) {
        click(button(view)!);
        const pin = button('このパネルを固定表示')!;
        assert.ok(pin, `${view} shows a pin button`);
        assert.equal(pin.closest('[hidden]'), null);
        assert.equal(pin.getAttribute('aria-pressed'), 'true');
    }
    click(button('このパネルを固定表示')!);
    assert.equal(drawer(), null, 'unpinning from another view releases the drawer');
    assert.equal(button('このパネルを固定表示')!.getAttribute('aria-pressed'), 'false');
    click(button('このパネルを固定表示')!);
    assert.ok(drawer(), 'and pinning it again works without going back to the sprite list');
    click(button('スプライト一覧')!);
    assert.equal(button('スプライト一覧を固定表示')!.getAttribute('aria-pressed'), 'true');
});

test('the bar shows one icon button per supplied content and switches the drawer', async t => {
    const {document, h, render, button, click, storage, mounts} = await mountDrawer(t);
    render(views(h));
    const bar = document.querySelector('[role="toolbar"]')!;
    assert.equal(bar.getAttribute('aria-label'), 'ドロワーの表示');
    const buttons = [...bar.querySelectorAll('button')];
    assert.deepEqual(buttons.map(item => item.getAttribute('aria-label')),
        ['スプライト一覧', 'プロジェクトフォルダ', 'Git 履歴', 'AI エージェント']);
    assert.deepEqual(buttons.map(item => item.title), ['スプライト一覧', 'プロジェクトフォルダ', 'Git 履歴', 'AI エージェント']);
    assert.ok(buttons.every(item => item.querySelector('svg[aria-hidden="true"]') && !item.textContent));
    assert.deepEqual(buttons.slice(0, 3).map(item => item.getAttribute('aria-pressed')), ['true', 'false', 'false']);
    assert.equal(buttons[3].hasAttribute('aria-pressed'), false);
    const spriteTools = () => document.querySelector('[aria-label="スプライト一覧の操作"]')!;
    assert.equal(spriteTools().closest('[hidden]'), null);
    const mounted = mounts();

    click(button('プロジェクトフォルダ')!);
    assert.equal(button('プロジェクトフォルダ')!.getAttribute('aria-pressed'), 'true');
    assert.equal(button('スプライト一覧')!.getAttribute('aria-pressed'), 'false');
    assert.ok(document.querySelector('[data-project]'));
    assert.ok(spriteTools().closest('[hidden]'), 'the sprite list and its tools are hidden');
    assert.ok(button('Refresh'), 'the selected view shows its own tools');
    assert.ok(bar.nextElementSibling?.contains(button('Refresh')), 'in the place of the sprite list tools');
    assert.equal(storage.values.get('layout.drawer'), '{"version":1,"view":"project"}');

    click(button('Git 履歴')!);
    assert.ok(document.querySelector('[data-history]'));
    assert.equal(document.querySelector('[data-project]'), null);
    assert.equal(button('Refresh'), null);
    click(button('スプライト一覧')!);
    assert.equal(spriteTools().closest('[hidden]'), null);
    assert.equal(document.querySelector('[data-history]'), null);
    assert.equal(mounts(), mounted, 'the GUI target pane stays mounted while another view is shown');
});

test('arrow keys move between the buttons with a roving tab stop', async t => {
    const {React, document, h, render, button, key} = await mountDrawer(t);
    render(views(h));
    const tabStops = () => [...document.querySelectorAll('[role="toolbar"] button')]
        .filter(item => item.getAttribute('tabindex') === '0').map(item => item.getAttribute('aria-label'));
    assert.deepEqual(tabStops(), ['スプライト一覧']);
    React.act(() => button('スプライト一覧')!.focus());
    key(document.activeElement!, 'ArrowRight');
    assert.equal(document.activeElement, button('プロジェクトフォルダ'));
    assert.deepEqual(tabStops(), ['プロジェクトフォルダ']);
    assert.equal(button('プロジェクトフォルダ')!.getAttribute('aria-pressed'), 'false', 'moving does not select');
    key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, button('プロジェクトフォルダ'), 'the buttons stand in one row, so up and down do nothing');
    key(document.activeElement!, 'ArrowRight');
    key(document.activeElement!, 'ArrowRight');
    assert.equal(document.activeElement, button('AI エージェント'));
    key(document.activeElement!, 'ArrowRight');
    assert.equal(document.activeElement, button('スプライト一覧'), 'left and right wrap around');
    key(document.activeElement!, 'ArrowLeft');
    assert.equal(document.activeElement, button('AI エージェント'));
    key(document.activeElement!, 'ArrowLeft');
    assert.equal(document.activeElement, button('Git 履歴'));
    key(document.activeElement!, 'Home');
    assert.equal(document.activeElement, button('スプライト一覧'));
    key(document.activeElement!, 'End');
    assert.equal(document.activeElement, button('AI エージェント'));
    assert.deepEqual(tabStops(), ['AI エージェント']);
});

test('the AI agent button opens the host menu without switching the drawer', async t => {
    const drawer = await mountDrawer(t);
    const {document, h, render, button, key, click} = drawer;
    render(views(h));
    const agents = button('AI エージェント')!;
    assert.equal(agents.getAttribute('aria-haspopup'), 'menu');
    assert.equal(agents.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector('[role="menu"]'), null);
    click(agents);
    assert.equal(agents.getAttribute('aria-expanded'), 'true');
    const menu = document.querySelector('[role="menu"]')!;
    assert.equal(agents.getAttribute('aria-controls'), menu.parentElement!.id);
    assert.equal(document.activeElement?.textContent, 'ChatGPT');
    assert.equal(button('スプライト一覧')!.getAttribute('aria-pressed'), 'true');
    key(document.activeElement!, 'Escape');
    assert.equal(agents.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, agents);

    click(agents);
    click(document.querySelector<HTMLElement>('[role="menuitem"]')!);
    assert.equal(document.querySelector('[role="menu"]'), null, 'the host closes the menu after a choice');
    assert.equal(document.activeElement, agents);

    click(agents);
    const outside = button('スプライト一覧')!;
    const {React} = drawer;
    React.act(() => { outside.dispatchEvent(new document.defaultView!.Event('pointerdown', {bubbles: true})); });
    assert.equal(document.querySelector('[role="menu"]'), null, 'a press outside closes the menu');
});

test('the saved view is restored and falls back to the sprite list while unavailable', async t => {
    const storage = memoryStorage({'layout.drawer': '{"version":1,"view":"git-history"}'});
    const {document, h, render, button} = await mountDrawer(t, {locale: 'en', storage});
    render(views(h, {git: false, agents: false}));
    assert.deepEqual([...document.querySelectorAll('[role="toolbar"] button')].map(item => item.getAttribute('aria-label')),
        ['Sprites', 'Project folder']);
    assert.equal(button('Sprites')!.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="Sprite list tools"]')!.closest('[hidden]'), null);
    assert.equal(storage.values.get('layout.drawer'), '{"version":1,"view":"git-history"}', 'the choice is kept');
    render(views(h));
    assert.equal(button('Git history')!.getAttribute('aria-pressed'), 'true');
    assert.ok(document.querySelector('[data-history]'));
    assert.equal(button('AI agents')!.getAttribute('aria-haspopup'), 'menu');
});
