import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://layout.test';
const example = '/example/index.html';
const files = new Map([[example, fileURLToPath(new URL('../example/index.html', import.meta.url))]]);
files.set('/example/.build/layout.js', fileURLToPath(new URL('../example/.build/layout.js', import.meta.url)));
const source = fileURLToPath(new URL('../src/', import.meta.url));
for (const entry of await readdir(source, {withFileTypes: true})) {
    if (entry.isFile() && /\.css$/.test(entry.name)) {
        files.set(`/src/${entry.name}`, path.join(source, entry.name));
    }
}
const built = fileURLToPath(new URL('../dist/', import.meta.url));
for (const entry of await readdir(built, {withFileTypes: true})) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
        files.set(`/dist/${entry.name}`, path.join(built, entry.name));
    }
}
for (const name of ['react', 'react-dom']) {
    const entry = `/umd/${name}.development.js`;
    files.set('/node_modules/' + name + entry, path.join(path.dirname(require.resolve(name + '/package.json')), entry));
}

async function openExample(t) {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 900, height: 600}});
    await page.route(origin + '/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const filename = files.get(pathname);
        if (!filename) return route.fulfill({status: 404});
        return route.fulfill({
            body: await readFile(filename),
            contentType: pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/javascript'
        });
    });
    return page;
}

test('the standalone host resizes, restores, and resets its dividers', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example);
    const columns = page.getByRole('separator', {name: 'Editor width'});
    const rows = page.getByRole('separator', {name: 'Stage height'});
    const toggle = page.getByRole('button', {name: 'Split layout'});
    await expect(columns).toBeVisible();
    const initial = Number(await columns.getAttribute('aria-valuenow'));
    await columns.press('ArrowLeft');
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));

    const divider = await rows.boundingBox();
    await page.mouse.move(divider.x + 30, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + 30, divider.y + 50, {steps: 5});
    await page.mouse.up();
    assert.ok(Number(await rows.getAttribute('aria-valuenow')) > 180);

    await page.setViewportSize({width: 450, height: 600});
    await expect(columns).toHaveAttribute('aria-valuemax', '230');
    await expect(columns).toHaveAttribute('aria-valuenow', '230');
    await page.setViewportSize({width: 420, height: 600});
    await expect(columns).toHaveCount(0);
    await expect(rows).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({width: 900, height: 600});
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));

    await toggle.click();
    await expect(columns).toHaveCount(0);
    await toggle.click();
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));
    await page.reload();
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial - 16));
    await columns.press('Enter');
    await expect(columns).toHaveAttribute('aria-valuenow', String(initial));
});


test('the standalone package uses its configured layout', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example + '?standard=1');
    const anchor = page.getByRole('button', {name: 'TurboWarp Plus layout'});
    const stage = page.locator('[data-stage]');
    await expect(anchor).toHaveCount(0);
    await expect(stage).toBeVisible();
    await expect(stage).toHaveCSS('position', 'absolute');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'top');
    await page.goto(origin + example + '?standard=0');
    await expect(stage).toBeVisible();
    await expect(stage).not.toHaveCSS('position', 'absolute');
    await expect(anchor).toHaveCount(0);
});

test('the sprite toolbar selects one section and searches in the active section', {timeout: 30_000}, async t => {
    const toolbar = '/example/sprite-editor-toolbar.html';
    files.set(toolbar, fileURLToPath(new URL('../example/sprite-editor-toolbar.html', import.meta.url)));
    const page = await openExample(t);
    await page.route(origin + '/example/react.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export default window.React;'
    }));
    await page.goto(origin + toolbar);
    const toolbarRoot = page.locator('.tw-plus-sprite-toolbar');
    const strip = page.getByRole('tablist');
    const tooltip = page.locator('.tw-plus-sprite-toolbar-tooltip');
    const selected = page.getByRole('tab', {selected: true});
    const unselected = page.getByRole('tab', {selected: false});
    const tabs = strip.getByRole('tab');
    await expect(strip).toHaveAttribute('aria-orientation', 'vertical');
    await expect(tabs).toHaveCount(5);
    await expect(selected).toHaveAccessibleName('コード');
    const buttonMargin = 4;
    const tabBounds = await Promise.all((await tabs.all()).map(async tab => {
        await expect(tab).toHaveText('');
        await expect(tab).toHaveCSS('margin-top', `${buttonMargin}px`);
        await expect(tab).toHaveCSS('margin-bottom', `${buttonMargin}px`);
        await expect(tab).toHaveCSS('padding', '0px');
        return tab.boundingBox();
    }));
    const panel = await page.getByRole('tabpanel').boundingBox();
    const share = await strip.evaluate((rail, margin) => {
        const {paddingTop, paddingBottom} = getComputedStyle(rail);
        const buttons = rail.childElementCount;
        const reserved = parseFloat(paddingTop) + parseFloat(paddingBottom) + 2 * margin * buttons;
        return (rail.clientHeight - reserved) / buttons;
    }, buttonMargin);
    assert.ok(tabBounds.every((tab, index) => {
        const previous = tabBounds[index - 1];
        return tab.width === 24 && tab.height > tab.width && Math.abs(tab.height - share) < 1 && tab.x + tab.width <= panel.x &&
            tab.x === tabBounds[0].x && (!previous || Math.abs(tab.y - previous.y - previous.height - 2 * buttonMargin) < 0.1);
    }));
    await selected.hover();
    await expect(tooltip).toHaveText('コード');
    assert.ok((await tooltip.boundingBox()).x >= panel.x);
    await page.mouse.move(800, 400);
    await expect(tooltip).toHaveCount(0);
    await expect(selected).toHaveCSS('background-color', 'rgb(103, 71, 168)');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(89, 89, 89)');
    await expect(unselected.first()).toHaveCSS('background-color', 'rgb(244, 244, 244)');
    await expect(strip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await selected.press('ArrowDown');
    await expect(selected).toHaveAccessibleName('コスチューム');
    await expect(selected).toBeFocused();
    await expect(tooltip).toHaveText('コスチューム');
    await selected.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(selected).toHaveCount(1);
    await expect(unselected.first()).toHaveAccessibleName('コード');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(89, 89, 89)');
    const search = page.getByRole('combobox');
    await expect(search).toHaveAttribute('placeholder', '検索');
    await search.fill('block');
    await expect(page.getByRole('option')).toHaveCount(2);
    await search.press('ArrowUp');
    await expect(page.getByRole('option', {selected: true})).toHaveText('Second block');
    await search.press('Enter');
    await expect(page.getByRole('tabpanel')).toHaveText('costumes: Second block');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.getByRole('button', {name: 'English'}).click();
    await expect(search).toHaveAttribute('placeholder', 'Search');
    await expect(selected).toHaveAccessibleName('Costumes');
    await page.getByRole('button', {name: 'Switch target'}).click();
    await selected.hover();
    await expect(selected).toHaveAccessibleName('Backdrops');
    await expect(tooltip).toHaveText('Backdrops');
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--color-scheme', 'dark');
        document.documentElement.style.setProperty('--dv-activegroup-visiblepanel-tab-background-color', '#111');
        document.documentElement.style.setProperty('--dv-inactivegroup-visiblepanel-tab-background-color', '#2e2e2e');
        document.documentElement.style.setProperty('--input-background', 'rgb(46, 52, 64)');
    });
    await expect(selected).toHaveCSS('background-color', 'rgb(103, 71, 168)');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(189, 189, 189)');
    await expect(unselected.first()).toHaveCSS('background-color', 'rgb(48, 48, 48)');
    await expect(strip).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(search).toHaveCSS('background-color', 'rgb(46, 52, 64)');
    await toolbarRoot.evaluate(element => element.setAttribute('data-active-group', 'false'));
    await expect(strip).toHaveCSS('background-color', 'rgb(46, 46, 46)');

    await page.locator('.tw-plus-sprite-tab-slot--split').evaluate(element => {element.style.height = '120px';});
    await selected.press('End');
    await expect(selected).toHaveAccessibleName('Messages');
    await expect(selected).toBeFocused();
    await expect(selected).toHaveCSS('height', '44px');
    await expect(tooltip).toHaveText('Messages');
    assert.ok(await strip.evaluate(element => element.scrollTop > 0));
});


test('the sprite layout menu opens above a clipped tab strip and supports keyboard commands', {timeout: 30_000}, async t => {
    const toolbar = '/example/sprite-editor-toolbar.html';
    files.set(toolbar, fileURLToPath(new URL('../example/sprite-editor-toolbar.html', import.meta.url)));
    const page = await openExample(t);
    await page.route(origin + '/example/react.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export default window.React;'
    }));
    await page.goto(origin + toolbar);
    const trigger = page.getByRole('button', {name: 'Editor panel layout'});
    await trigger.press('ArrowDown');
    await expect(page.getByRole('menuitem', {name: 'Close this split'})).toBeDisabled();
    await expect(page.getByRole('menuitem', {name: 'Split right'})).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#command')).toHaveText('below');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole('menuitem', {name: 'Close this split'})).toBeEnabled();
    await page.getByRole('menuitem', {name: 'Close this split'}).click();
    await expect(page.locator('#command')).toHaveText('closed');
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
});
