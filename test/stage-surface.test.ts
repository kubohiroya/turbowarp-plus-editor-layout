import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {createStagePopoutHost} from '../src/stage-surface.ts';

const title = 'Stage';

test('reports a blocked popout without opening a Dockview panel', () => {
    const host = createStagePopoutHost({open: () => null}, title);
    assert.equal(host.open({}), null);
});

test('mounts in the child document and disconnects when the Dockview tab closes', async t => {
    const opener = new JSDOM('', {pretendToBeVisual: true});
    const child = new JSDOM('<main></main>', {pretendToBeVisual: true});
    const globals = {
        window: opener.window,
        document: opener.window.document,
        Node: opener.window.Node,
        ResizeObserver: class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    };
    Object.assign(globalThis, globals);
    const mount = child.window.document.querySelector('main')!;
    const windowClosed = new AbortController();
    let closes = 0;
    const host = createStagePopoutHost({
        open: (request: string) => ({
            ready: Promise.resolve({mount, request}),
            disconnected: windowClosed.signal,
            close: () => { closes++; }
        })
    }, title);

    const connection = host.open('request')!;
    t.after(() => {
        try {
            connection.close();
        } finally {
            child.window.close();
            opener.window.close();
            for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
        }
    });
    const target = await connection.ready;
    assert.equal(target.request, 'request');
    assert.equal(target.mount.ownerDocument, child.window.document);
    assert.ok(mount.querySelector('.dv-content-container')?.contains(target.mount));
    assert.match(mount.querySelector('.dv-tab')?.textContent ?? '', /Stage/);

    const closeTab = mount.querySelector<HTMLElement>('.dv-default-tab-action');
    assert.ok(closeTab);
    closeTab.click();
    assert.equal(connection.disconnected.aborted, true);
    connection.close();
    connection.close();
    assert.equal(closes, 1);
    assert.equal(mount.querySelector('.dv-tab'), null);
});

test('handles a child window closing before its mount is ready', async () => {
    const child = new JSDOM('<main></main>');
    try {
        const mount = child.window.document.querySelector('main')!;
        const windowClosed = new AbortController();
        let closes = 0;
        const host = createStagePopoutHost({
            open: () => ({
                ready: Promise.resolve({mount}),
                disconnected: windowClosed.signal,
                close: () => { closes++; }
            })
        }, title);

        const connection = host.open({})!;
        windowClosed.abort();
        assert.equal(connection.disconnected.aborted, true);
        await assert.rejects(connection.ready, /Stage window closed/);
        connection.close();
        assert.equal(closes, 1);
        assert.equal(mount.childElementCount, 0);
    } finally {
        child.window.close();
    }
});

test('the menu bar launcher replaces the stage drawer handle on the right edge', async t => {
    const dom = new JSDOM('<main></main><nav></nav>', {pretendToBeVisual: true});
    const globals = {window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true};
    Object.assign(globalThis, globals);
    const React = await import('react');
    const {act} = React;
    const {createRoot} = await import('react-dom/client');
    const {createStandardLayout} = await import('../src/standard-layout.ts');
    const {createStageSurface} = await import('../src/stage-surface.ts');

    const styles = new Proxy({}, {get: (_, key) => String(key)});
    const context = React.createContext({locale: 'ja', stageDrawer: true});
    const {EdgeDrawer} = createStandardLayout(React, {styles, targetStyles: styles, context, LayoutMenu: () => null});
    const StageSurface = createStageSurface(React, {context, EdgeDrawer, Panel: () => null});
    const MenuButton = ({label}: {label: string}) => React.createElement('button', {type: 'button'}, label);
    const nav = dom.window.document.querySelector('nav')!;
    const root = createRoot(dom.window.document.querySelector('main')!);
    t.after(() => {
        act(() => root.unmount());
        dom.window.close();
        for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
    });
    const handle = () => dom.window.document.querySelector('[aria-label="ステージを展開"]');

    act(() => root.render(React.createElement(StageSurface)));
    assert.ok(handle(), 'the drawer keeps its own handle without a launcher');

    act(() => root.render(React.createElement(StageSurface, {launcher: {mount: nav, styles, MenuButton}})));
    assert.equal(handle()?.outerHTML, undefined);
    assert.match(nav.textContent ?? '', /ステージを開く/);
});
