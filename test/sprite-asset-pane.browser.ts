import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-asset-pane.test';
const html = `<!doctype html>
<link rel="stylesheet" href="/sprite-asset-pane.css">
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js"}}</script>
<main style="width: 350px; height: 340px"></main>
<script type="module">
import {SpriteAssetPane} from '/sprite-asset-pane.js';
const root = ReactDOM.createRoot(document.querySelector('main'));
const costume = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>');
const assets = {
    costumes: [{id:'c1', name:'Circle', imageUrl: costume}, {id:'c2', name:'Other', imageUrl: costume}],
    sounds: [{id:'s1', name:'First', duration:1, peaks:[.1,.2]}, {id:'s2', name:'Second', duration:2, peaks:[.3,.8,.4]}]
};
let kind = 'costumes';
let selectedId = 'c1';
let editable = true;
let value = 5;
let x = 10;
let activateOnClick = false;
let locale = 'en';
let withEdit = false;
window.selections = [];
window.writes = [];
window.edits = [];
function render(synchronous = true) {
    const props = kind === 'variables' ? {
        variables:[{id:'speed', name:'Speed', value, scope:'local'}],
        targetId:'sprite',
        properties:{name:'Dango', x},
        onWriteProperties(_id, patch) { x = patch.x; render(false); },
        onWrite(id, next) { window.writes.push([id, next]); value = next; render(false); },
        onEdit: withEdit ? edit => {
            window.edits.push(edit);
            if (edit.type !== 'delete' && !edit.name.trim()) return 'emptyName';
        } : undefined
    } : {
        items:assets[kind], selectedId,
        onSelect(id) { window.selections.push(id); selectedId = id; render(); }
    };
    const pane = React.createElement(SpriteAssetPane, {...props, editable, locale, kind});
    const container = React.createElement('div', {style:{height:'100%'}, onClickCapture(event) {
        if (editable || !activateOnClick) return;
        event.preventDefault();
        event.stopPropagation();
        editable = true;
        render(false);
    }}, pane);
    if (synchronous) ReactDOM.flushSync(() => root.render(container));
    else root.render(container);
}
window.mode = next => { editable = next; render(); };
window.section = (next, id) => { kind = next; selectedId = id; render(); };
window.enableClickActivation = (enabled = true) => { activateOnClick = enabled; };
window.variableEditing = (nextLocale = 'en') => { withEdit = true; locale = nextLocale; kind = 'variables'; render(); };
render();
</script>`;

async function openPage(t) {
    const browser = await chromium.launch({executablePath: process.env.SPRITE_PROPERTIES_CHROME});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 640, height: 480}});
    const routes = new Map([
        ['/sprite-asset-pane.js', new URL('../dist/sprite-asset-pane.js', import.meta.url)],
        ['/sprite-variable-edit.js', new URL('../dist/sprite-variable-edit.js', import.meta.url)],
        ['/native-tile-title.js', new URL('../dist/native-tile-title.js', import.meta.url)],
        ['/sprite-properties.js', new URL('../dist/sprite-properties.js', import.meta.url)],
        ['/sprite-asset-pane.css', new URL('../src/sprite-asset-pane.css', import.meta.url)],
        ...['react', 'react-dom'].map(name => [
            `/${name}.umd.js`, path.join(path.dirname(require.resolve(name + '/package.json')), 'umd', name + '.development.js')
        ])
    ]);
    await page.route(origin + '/**', async route => {
        const {pathname} = new URL(route.request().url());
        if (pathname === '/') return route.fulfill({contentType: 'text/html', body: html});
        if (pathname === '/react.js') {
            return route.fulfill({contentType: 'application/javascript', body: 'export const {useRef, useState} = window.React; export default window.React;'});
        }
        const source = routes.get(pathname);
        if (!source) return route.fulfill({status: 404});
        return route.fulfill({
            contentType: pathname.endsWith('.css') ? 'text/css' : 'application/javascript',
            body: await readFile(source)
        });
    });
    await page.goto(origin);
    return page;
}

test('assets keep selection and dimensions while inactive; variables retain and commit an edit once', async t => {
    const page = await openPage(t);
    const box = locator => locator.boundingBox();
    for (const [kind, id, selected, other, image] of [
        ['costumes', 'c1', 'Circle', 'Other', 'Circle'],
        ['sounds', 's2', 'Second', 'First', 'Waveform: Second']
    ]) {
        await page.evaluate(({kind, id}) => window.section(kind, id), {kind, id});
        const item = page.getByRole('button', {name: selected, exact: true});
        const preview = page.getByRole('img', {name: image, exact: true});
        await preview.waitFor();
        assert.equal(await item.getAttribute('title'), selected);
        const activeBoxes = [await box(item), await box(preview)];
        await page.evaluate(() => window.mode(false));
        assert.equal(await item.getAttribute('aria-current'), 'true');
        assert.deepEqual([await box(item), await box(preview)], activeBoxes);
        await page.getByRole('button', {name: other, exact: true}).dispatchEvent('click');
        assert.deepEqual(await page.evaluate(() => window.selections), []);
        await page.evaluate(() => window.enableClickActivation());
        await page.getByRole('button', {name: other, exact: true}).click({force: true});
        await item.and(page.locator(':not([aria-disabled])')).waitFor();
        assert.equal(await item.getAttribute('aria-current'), 'true');
        assert.deepEqual(await page.evaluate(() => window.selections), []);
        await page.getByRole('button', {name: other, exact: true}).click();
        assert.deepEqual(await page.evaluate(() => window.selections), [kind === 'costumes' ? 'c2' : 's1']);
        await page.evaluate(() => { window.selections = []; window.enableClickActivation(false); });
    }

    await page.evaluate(() => window.section('variables'));
    const x = page.getByLabel(/^x$/i);
    await x.fill('30');
    await x.press('Enter');
    assert.equal(await x.inputValue(), '30');
    const speed = page.getByRole('textbox', {name: 'Speed'});
    await speed.fill('7');
    const activeField = await box(speed);
    await page.evaluate(() => window.mode(false));
    assert.equal(await speed.inputValue(), '7');
    assert.equal(await speed.isEditable(), false);
    assert.equal(await x.inputValue(), '30');
    assert.equal(await x.isEditable(), false);
    assert.deepEqual(await box(speed), activeField);
    await page.evaluate(() => window.mode(true));
    assert.equal(await speed.isEditable(), true);
    await speed.fill('9');
    await speed.press('Escape');
    await speed.blur();
    assert.equal(await speed.inputValue(), '7');
    assert.deepEqual(await page.evaluate(() => window.writes), [['speed', 7]]);
});

test('variable create, rename and delete open a Scratch-style modal dialog', async t => {
    const page = await openPage(t);
    await page.evaluate(() => window.variableEditing('ja'));
    assert.deepEqual(await page.getByRole('columnheader').allTextContents(), ['変数名', '変数の値', '操作']);
    const add = page.getByRole('button', {name: '変数を作る'});
    const [pane, addBox] = [await page.locator('.tw-sprite-variables').boundingBox(), await add.boundingBox()];
    assert.ok(addBox.x + addBox.width > pane.x + pane.width - 30 && addBox.y + addBox.height > pane.y + pane.height - 30,
        'the add button sits at the bottom-right corner of the pane');

    await add.click();
    const dialog = page.getByRole('dialog', {name: '新しい変数'});
    await dialog.waitFor();
    const name = dialog.getByLabel('新しい変数名:');
    assert.equal(await name.evaluate(node => node === document.activeElement), true);
    await dialog.getByRole('button', {name: 'OK'}).click();
    await dialog.getByRole('alert').waitFor();
    await name.fill('score');
    await name.press('Enter');
    await dialog.waitFor({state: 'detached'});

    await page.getByRole('button', {name: '変数名を変更'}).click();
    const rename = page.getByRole('dialog', {name: '変数名を変更'});
    assert.equal(await rename.getByLabel('新しい変数名:').inputValue(), 'Speed');
    await page.keyboard.press('Escape');
    await rename.waitFor({state: 'detached'});

    await page.getByRole('button', {name: '変数を削除'}).click();
    const remove = page.getByRole('dialog', {name: '変数を削除'});
    await remove.getByText('変数「Speed」を削除しますか？').waitFor();
    await remove.getByRole('button', {name: '削除'}).click();
    await remove.waitFor({state: 'detached'});

    assert.deepEqual(await page.evaluate(() => window.edits), [
        {type: 'create', name: ''}, {type: 'create', name: 'score'}, {type: 'delete', id: 'speed'}
    ]);
});
