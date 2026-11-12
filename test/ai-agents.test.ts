import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import type {DesktopAiAgentsPort} from '../src/ai-agents.ts';
import {
    agentSettingsKey, checkAgentUrl, defaultAgentSettings, enabledAgentServices, openAgentService,
    parseAgentSettings, readAgentSettings, writeAgentSettings
} from '../src/ai-agent-settings.ts';

const memoryStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return {values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }};
};
const saved = (services: unknown[]) => JSON.stringify({version: 1, services});
const summary = (settings: ReturnType<typeof parseAgentSettings>) =>
    settings.services.map(service => [service.id, service.name, service.enabled, service.target.url]);

test('only https: addresses are accepted', () => {
    assert.deepEqual(checkAgentUrl(' https://chatgpt.com/c/abc '), {url: 'https://chatgpt.com/c/abc'});
    assert.deepEqual(checkAgentUrl('https://claude.ai'), {url: 'https://claude.ai/'});
    assert.deepEqual(checkAgentUrl('http://example.com/'), {problem: 'not-https'});
    assert.deepEqual(checkAgentUrl('javascript:alert(1)'), {problem: 'not-https'});
    assert.deepEqual(checkAgentUrl('chatgpt.com'), {problem: 'invalid'});
    assert.deepEqual(checkAgentUrl('   '), {problem: 'empty'});
    assert.deepEqual(checkAgentUrl(undefined), {problem: 'empty'});
});

test('missing or broken settings fall back to both presets, turned on', () => {
    const defaults = [['chatgpt', 'ChatGPT', true, 'https://chatgpt.com/'], ['claude', 'Claude', true, 'https://claude.ai/new']];
    for (const raw of [null, undefined, '', '{', 'null', '[]', '{"version":2,"services":[]}', '{"version":1}']) {
        assert.deepEqual(summary(parseAgentSettings(raw)), defaults, String(raw));
    }
    assert.deepEqual(defaultAgentSettings(), parseAgentSettings(null));
});

test('saved entries are read one by one, keeping the valid ones', () => {
    const settings = parseAgentSettings(saved([
        {preset: 'claude', enabled: false, target: {kind: 'url', url: 'https://claude.ai/chat/123'}},
        {preset: 'chatgpt', target: {kind: 'url', url: 'http://chatgpt.com/'}},
        {id: 'mine', name: ' Gemini ', target: {kind: 'url', url: 'https://gemini.google.com/app'}},
        {id: 'mine', name: 'Copy', enabled: false, target: {kind: 'url', url: 'https://example.com/'}},
        {id: 'plain', name: 'Plain', target: {kind: 'url', url: 'http://example.com/'}},
        {id: 'blank', name: ' ', target: {kind: 'url', url: 'https://example.com/'}},
        {id: 'app', name: 'Desktop', target: {kind: 'launch', command: 'claude'}},
        null, 'text'
    ]));
    assert.deepEqual(summary(settings), [
        ['chatgpt', 'ChatGPT', true, 'https://chatgpt.com/'],
        ['claude', 'Claude', false, 'https://claude.ai/chat/123'],
        ['mine', 'Gemini', true, 'https://gemini.google.com/app'],
        ['mine-2', 'Copy', false, 'https://example.com/']
    ]);
    assert.deepEqual(enabledAgentServices(settings).map(service => service.name), ['ChatGPT', 'Gemini']);
});

test('settings are written as versioned JSON and survive unusable storage', () => {
    const storage = memoryStorage();
    const settings = parseAgentSettings(saved([{preset: 'chatgpt', enabled: false},
        {id: 'x', name: 'Mine', target: {kind: 'url', url: 'https://example.com/'}}]));
    assert.equal(writeAgentSettings(settings, storage), true);
    assert.deepEqual(JSON.parse(storage.values.get(agentSettingsKey)!), {version: 1, services: [
        {preset: 'chatgpt', enabled: false, target: {kind: 'url', url: 'https://chatgpt.com/'}},
        {preset: 'claude', enabled: true, target: {kind: 'url', url: 'https://claude.ai/new'}},
        {id: 'x', name: 'Mine', enabled: true, target: {kind: 'url', url: 'https://example.com/'}}
    ]});
    assert.deepEqual(readAgentSettings(storage), settings);
    const denied = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
    assert.deepEqual(readAgentSettings(denied), defaultAgentSettings());
    assert.equal(writeAgentSettings(settings, denied), false);
    assert.equal(writeAgentSettings(settings, null), false);
});

test('a service opens in a new tab without access to the Editor', () => {
    const calls: unknown[][] = [];
    openAgentService(defaultAgentSettings().services[1], (...args) => calls.push(args));
    assert.deepEqual(calls, [['https://claude.ai/new', '_blank', 'noopener,noreferrer']]);
});

async function mountMenu(t, {locale = 'ja', storage = memoryStorage(), desktop = undefined as DesktopAiAgentsPort | undefined} = {}) {
    const dom = new JSDOM('<main><button id="trigger">AI</button><div id="menu"></div></main>', {pretendToBeVisual: true});
    const globals = {window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true};
    Object.assign(globalThis, globals);
    const React = await import('react');
    const {act} = React;
    const {createRoot} = await import('react-dom/client');
    const {createAiAgents} = await import('../src/ai-agents.ts');
    const document = dom.window.document;
    const opened: string[] = [];
    let closed = 0;
    const agents = createAiAgents(React, {storage, desktop, open: url => opened.push(url)});
    const root = createRoot(document.getElementById('menu')!);
    t.after(() => {
        act(() => root.unmount());
        document.querySelector('[role="dialog"]')?.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        dom.window.close();
        for (const key of Object.keys(globals)) Reflect.deleteProperty(globalThis, key);
    });
    const trigger = document.getElementById('trigger')!;
    const show = () => act(() => root.render(agents.drawerMenu.renderMenu({locale, close: () => {
        closed++;
        trigger.focus();
        root.render(null);
    }}) as never));
    const key = (target: Element, key: string, init = {}) => act(() => {
        target.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init}));
    });
    const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    return {dom, document, storage, show, key, items, opened, closed: () => closed, act, agents, trigger};
}

test('the menu lists the turned-on services, a separator and the settings', async t => {
    const storage = memoryStorage({[agentSettingsKey]: saved([{preset: 'chatgpt', enabled: false},
        {id: 'a', name: 'Old chat', target: {kind: 'url', url: 'https://chatgpt.com/c/1'}}])});
    const {document, show, key, items, opened, closed, act} = await mountMenu(t, {storage});
    show();
    const menu = document.querySelector('[role="menu"]')!;
    assert.equal(menu.getAttribute('aria-label'), 'AI エージェント');
    assert.deepEqual(items().map(item => item.textContent), ['Claude', 'Old chat', 'AI エージェント設定…']);
    assert.ok(items().every(item => item.querySelector('svg[aria-hidden="true"]')), 'each item has an icon');
    assert.equal(items()[0].querySelector('svg')!.dataset.initial, 'C', 'a preset shows its initial in a bubble');
    assert.equal(items()[1].querySelector('svg')!.dataset.initial, undefined, 'the user\'s own address shows a generic icon');
    assert.equal(items()[2].previousElementSibling?.getAttribute('role'), 'separator');
    assert.equal(items()[0].title, '別のタブで開きます');
    assert.equal(document.querySelector('p'), null, 'no hint while services are shown');

    act(() => items()[0].focus());
    key(items()[0], 'ArrowDown');
    assert.equal(document.activeElement, items()[1]);
    key(items()[1], 'End');
    assert.equal(document.activeElement, items()[2]);
    key(items()[2], 'ArrowDown');
    assert.equal(document.activeElement, items()[0], 'the arrows wrap around');
    key(items()[0], 'ArrowUp');
    assert.equal(document.activeElement, items()[2]);

    act(() => items()[1].click());
    assert.deepEqual(opened, ['https://chatgpt.com/c/1']);
    assert.equal(closed(), 1);
});

test('without turned-on services the menu offers only the settings, with a hint', async t => {
    const storage = memoryStorage({[agentSettingsKey]: saved([{preset: 'chatgpt', enabled: false}, {preset: 'claude', enabled: false}])});
    const {document, show, items} = await mountMenu(t, {locale: 'en', storage});
    show();
    assert.deepEqual(items().map(item => item.textContent), ['AI agent settings…']);
    assert.equal(document.querySelector('[role="separator"]'), null);
    const hint = document.querySelector('p')!;
    assert.equal(hint.textContent, 'No AI services are shown here. Choose them in the settings.');
    assert.equal(document.querySelector('[role="menu"]')!.getAttribute('aria-describedby'), hint.id);
});

test('the settings dialog edits presets and the user\'s own services', async t => {
    const {dom, document, show, key, items, storage, act, trigger} = await mountMenu(t);
    show();
    act(() => items().at(-1)!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.ok(dialog, 'the settings item opens the dialog');
    assert.equal(document.querySelector('[role="menu"]'), null, 'and closes the menu');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent, 'AI エージェント設定');
    const field = (group: string, label: string) => {
        const scope = [...document.querySelectorAll('[role="dialog"] [role="group"]')].find(item => item.getAttribute('aria-label') === group)!;
        const labelElement = [...scope.querySelectorAll('label')].find(item => item.textContent === label)!;
        return document.getElementById(labelElement.htmlFor) as HTMLInputElement;
    };
    const button = (name: string) => [...dialog.querySelectorAll('button')].find(item => item.textContent === name)!;
    assert.equal(document.activeElement, field('ChatGPT', 'ChatGPT をメニューに出す'), 'focus starts on the first field');
    assert.equal(field('ChatGPT', 'ChatGPT URL').placeholder, 'https://chatgpt.com/');
    assert.equal(field('ChatGPT', 'ChatGPT URL').value, '', 'an unchanged preset address shows as empty');

    field('ChatGPT', 'ChatGPT をメニューに出す').checked = false;
    field('Claude', 'Claude URL').value = 'http://claude.ai/chat/1';
    act(() => button('サービスを追加').click());
    assert.equal(document.activeElement, field('追加したサービス 1', '名前'));
    act(() => button('サービスを追加').click());
    act(() => [...field('追加したサービス 2', '名前').closest('[role="group"]')!.querySelectorAll('button')].at(-1)!.click());
    assert.equal(document.activeElement, field('追加したサービス 1', '名前'), 'removing a row moves focus to its neighbour');
    field('追加したサービス 1', 'URL').value = 'ftp://example.com/';

    act(() => button('保存').click());
    const claudeUrl = field('Claude', 'Claude URL');
    assert.equal(claudeUrl.getAttribute('aria-invalid'), 'true');
    assert.equal(document.getElementById(claudeUrl.getAttribute('aria-describedby')!)!.textContent,
        'https: で始まるアドレスだけを使えます。');
    const name = field('追加したサービス 1', '名前');
    assert.equal(document.getElementById(name.getAttribute('aria-describedby')!)!.textContent, '名前を入力してください。');
    assert.equal(document.activeElement, claudeUrl, 'focus moves to the first problem');
    assert.equal(storage.values.size, 0, 'nothing is saved while a field is wrong');

    claudeUrl.value = 'https://claude.ai/chat/1';
    act(() => claudeUrl.dispatchEvent(new dom.window.Event('input', {bubbles: true})));
    assert.equal(claudeUrl.hasAttribute('aria-invalid'), false, 'typing clears the error');
    name.value = 'Old chat';
    field('追加したサービス 1', 'URL').value = 'https://chatgpt.com/c/1';
    act(() => button('保存').click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger, 'focus returns to where the menu was opened');
    assert.deepEqual(summary(readAgentSettings(storage)), [
        ['chatgpt', 'ChatGPT', false, 'https://chatgpt.com/'],
        ['claude', 'Claude', true, 'https://claude.ai/chat/1'],
        ['custom-1', 'Old chat', true, 'https://chatgpt.com/c/1']
    ]);

    show();
    assert.deepEqual(items().map(item => item.textContent), ['Claude', 'Old chat', 'AI エージェント設定…'],
        'the menu reads the saved settings when it opens');
    act(() => items().at(-1)!.click());
    const again = document.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.equal(field('Claude', 'Claude URL').value, 'https://claude.ai/chat/1');
    assert.equal(field('追加したサービス 1', '名前').value, 'Old chat');
    const focusables = [...again.querySelectorAll<HTMLElement>('button, input')];
    act(() => focusables.at(-1)!.focus());
    key(focusables.at(-1)!, 'Tab');
    assert.equal(document.activeElement, focusables[0], 'Tab stays inside the dialog');
    key(focusables[0], 'Tab', {shiftKey: true});
    assert.equal(document.activeElement, focusables.at(-1));
    field('Claude', 'Claude URL').value = '';
    key(again, 'Escape');
    assert.equal(document.querySelector('[role="dialog"]'), null, 'Escape closes without saving');
    assert.equal(document.activeElement, trigger);
    assert.equal(readAgentSettings(storage).services[1].target.url, 'https://claude.ai/chat/1');
});

test('an emptied preset address goes back to the default, and a refused save keeps the dialog open', async t => {
    const dom = new JSDOM('<main><button>Plus</button></main>', {pretendToBeVisual: true});
    t.after(() => dom.window.close());
    const document = dom.window.document;
    const {openAgentSettingsDialog} = await import('../src/ai-agent-settings.ts');
    const storage = memoryStorage({[agentSettingsKey]: saved([{preset: 'chatgpt', target: {kind: 'url', url: 'https://chatgpt.com/c/9'}}])});
    const returnFocus = document.querySelector('button')!;
    let result;
    openAgentSettingsDialog({document, locale: 'en', storage, returnFocus, onSave: settings => { result = settings; }});
    const dialog = document.querySelector('[role="dialog"]')!;
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent, 'AI agent settings');
    const url = dialog.querySelector<HTMLInputElement>('input[type="url"]')!;
    assert.equal(url.value, 'https://chatgpt.com/c/9');
    url.value = '  ';
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    assert.equal(result.services[0].target.url, 'https://chatgpt.com/');
    assert.equal(document.activeElement, returnFocus);

    const refusing = {getItem: () => null, setItem() { throw new Error('quota'); }};
    const opened = openAgentSettingsDialog({document, locale: 'en', storage: refusing});
    assert.equal(openAgentSettingsDialog({document, locale: 'en', storage: refusing}), opened, 'only one dialog at a time');
    opened.element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const alert = opened.element.querySelector('[role="alert"]')!;
    assert.equal(alert.hasAttribute('hidden'), false);
    assert.match(alert.textContent!, /could not be saved/);
    [...opened.element.querySelectorAll('button')].find(item => item.textContent === 'Cancel')!.click();
    assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('saving web settings preserves unknown target kinds without listing them', async t => {
    const opaque = {id: 'future', name: 'Future target', target: {kind: 'future', extra: [1, 2]}};
    const storage = memoryStorage({[agentSettingsKey]: saved([opaque])});
    const {show, items, document, act} = await mountMenu(t, {storage, locale: 'en'});
    show();
    assert.deepEqual(items().map(item => item.textContent), ['ChatGPT', 'Claude', 'AI agent settings…']);
    act(() => items().at(-1)!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    act(() => dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    assert.deepEqual(JSON.parse(storage.values.get(agentSettingsKey)!).services.at(-1), opaque);
});

test('the Desktop menu passes only the application ID and shows launch errors', async t => {
    const calls: unknown[][] = [];
    const desktop = {
        list: async () => ({ok: true, value: {revision: 'saved', entries: [
            {id: 'app', name: 'Desktop app', application: '/app', args: [], cwd: '', url: 'https://example.com/agent'}
        ]}}),
        launch: async (...args) => {
            calls.push(args);
            return {ok: false, code: 'app-missing'};
        }
    } as DesktopAiAgentsPort;
    const {show, items, act, document, closed, opened} = await mountMenu(t, {desktop, locale: 'en'});
    await act(async () => { show(); });
    const app = items().find(item => item.textContent === 'Desktop app')!;
    assert.equal(app.title, 'Launches a desktop application');
    await act(async () => { app.click(); });
    assert.deepEqual(calls, [['app']]);
    assert.equal(closed(), 0);
    assert.equal(document.querySelector('[role="alert"]')!.textContent, 'The selected application is missing or cannot run.');
    act(() => items().find(item => item.textContent === 'Open the website')!.click());
    assert.deepEqual(opened, ['https://example.com/agent']);
    assert.equal(closed(), 1);
});

test('Desktop settings select applications, preview arguments, reorder and launch a saved entry', async t => {
    const ok = <T,>(value: T) => ({ok: true as const, value});
    const launched: string[] = [];
    let revision = 'old';
    let entries = [{id: 'existing', name: 'Existing app', application: '/old-app', args: [], cwd: ''}];
    const context = {projectFolder: '/work/Project with spaces', repository: '/work', branch: 'main'};
    const desktop: DesktopAiAgentsPort = {
        list: async () => ok({revision, entries}),
        context: async () => ok(context),
        chooseContext: async () => ok(context),
        chooseApp: async () => ok({selection: 'opaque-token', application: '/new-app'}),
        save: async (previous, drafts) => {
            assert.equal(previous, revision);
            assert.equal(drafts[0].selection, 'opaque-token');
            assert.equal('application' in drafts[0], false);
            entries = drafts.map(({selection, ...draft}) => ({...draft, application: selection ? '/new-app' : '/old-app'}));
            revision = 'new';
            return ok({revision, entries});
        },
        launch: async id => {
            launched.push(id);
            return ok(null);
        }
    };
    const {items, show, act, document, dom} = await mountMenu(t, {desktop, locale: 'en'});
    await act(async () => { show(); });
    await act(async () => { items().at(-1)!.click(); });
    const section = [...document.querySelectorAll('fieldset')].find(item => item.querySelector('legend')?.textContent === 'Desktop applications')!;
    const button = (name: string, parent: Element = section) =>
        [...parent.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name)!;
    button('Add an application').click();
    const newRow = section.querySelectorAll('[role="group"]')[1];
    const name = newRow.querySelector('input')!;
    name.value = 'New app';
    name.dispatchEvent(new dom.window.Event('input'));
    button('Choose…', newRow).click();
    await Promise.resolve();
    await Promise.resolve();
    const args = newRow.querySelector('textarea')!;
    args.value = '{projectFolder}\n{branch}';
    args.dispatchEvent(new dom.window.Event('input'));
    assert.match(newRow.textContent!, /\["\/work\/Project with spaces","main"\]/u);
    button('Move up', newRow).click();
    button('Save applications').click();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(entries.map(item => item.name), ['New app', 'Existing app']);
    const first = section.querySelector('[role="group"]')!;
    button('Try launching', first).click();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(launched, [entries[0].id]);
});
