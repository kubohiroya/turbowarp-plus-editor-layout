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
const tileTitle = '@kubohiroya/turbowarp-plus-editor-sprite-panes/native-tile-title';
files.set(`/node_modules/${tileTitle.replace('native-tile-title', 'dist/native-tile-title.js')}`, require.resolve(tileTitle));
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

test('the sprite layout menu opens above a clipped tab strip and supports keyboard commands', {timeout: 30_000}, async t => {
    const menu = '/example/sprite-layout-menu.html';
    files.set(menu, fileURLToPath(new URL('../example/sprite-layout-menu.html', import.meta.url)));
    const page = await openExample(t);
    await page.goto(origin + menu);
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

test('the drawer bar switches host views, keeps the choice and opens the agent menu', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example + '?standard=1&drawer=1&lang=ja');
    const bar = page.getByRole('toolbar', {name: 'ドロワーの表示'});
    const sprites = bar.getByRole('button', {name: 'スプライト一覧', exact: true});
    const project = bar.getByRole('button', {name: 'プロジェクトフォルダ'});
    const agents = bar.getByRole('button', {name: 'AI エージェント'});
    const spriteTools = page.getByRole('group', {name: 'スプライト一覧の操作'});
    await expect(sprites).toHaveAttribute('aria-pressed', 'true');
    await expect(spriteTools).toBeVisible();
    const boxes = await Promise.all([sprites, project, bar.getByRole('button', {name: 'Git 履歴'}), agents]
        .map(button => button.boundingBox()));
    assert.ok(boxes.every(box => box.y === boxes[0].y), 'one row');
    assert.ok(boxes.every((box, index) => index === 0 || box.x > boxes[index - 1].x), 'in order');
    assert.ok(boxes.every(box => box.x >= 0 && box.x + box.width <= 120), 'inside the drawer');
    const screenshot = process.env.DRAWER_BAR_SCREENSHOT;
    if (screenshot) {
        const clip = {x: 0, y: 0, width: 360, height: 220};
        await page.screenshot({path: screenshot, clip});
        await agents.click();
        await expect(page.getByRole('menuitem', {name: 'ChatGPT'})).toBeFocused();
        await page.screenshot({path: screenshot.replace(/\.png$/, '-menu.png'), clip});
        await page.keyboard.press('Escape');
    }

    await sprites.focus();
    await page.keyboard.press('ArrowRight');
    await expect(project).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(project).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', {name: 'プロジェクトのファイル'})).toBeVisible();
    await expect(spriteTools).toBeHidden();
    await expect(page.getByRole('button', {name: '更新'})).toBeVisible();
    const barWidth = async () => (await bar.boundingBox()).width;
    await expect.poll(barWidth, {message: 'the other views open the drawer wider'}).toBeGreaterThan(250);
    await sprites.click();
    await expect.poll(barWidth, {message: 'and the sprite list keeps its narrow width'}).toBeLessThan(120);
    await project.click();
    await expect.poll(barWidth).toBeGreaterThan(250);
    await page.reload();
    await expect(project).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', {name: 'プロジェクトのファイル'})).toBeVisible();

    await agents.focus();
    await page.keyboard.press('Space');
    await expect(agents).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', {name: 'ChatGPT'})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(agents).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(project).toHaveAttribute('aria-pressed', 'true');
});

test('the AI agent menu opens services and the settings dialog saves the user\'s own service', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + example + '?standard=1&drawer=1&lang=ja');
    const agents = page.getByRole('toolbar', {name: 'ドロワーの表示'}).getByRole('button', {name: 'AI エージェント'});
    const menu = page.getByRole('menu', {name: 'AI エージェント'});
    await agents.click();
    await expect(menu.getByRole('menuitem')).toHaveText(['ChatGPT', 'Claude', 'AI エージェント設定…']);
    await expect(menu.getByRole('separator')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', {name: 'Claude'})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-agent', 'https://claude.ai/new');
    await expect(menu).toHaveCount(0);
    await expect(agents).toBeFocused();

    await agents.click();
    await menu.getByRole('menuitem', {name: 'AI エージェント設定…'}).click();
    const dialog = page.getByRole('dialog', {name: 'AI エージェント設定'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('ChatGPT をメニューに出す')).toBeFocused();
    await dialog.getByLabel('ChatGPT をメニューに出す').uncheck();
    await dialog.getByRole('button', {name: 'サービスを追加'}).click();
    const row = dialog.getByRole('group', {name: '追加したサービス 1'});
    await expect(row.getByLabel('名前')).toBeFocused();
    await row.getByLabel('名前').fill('前回の会話');
    await row.getByLabel('URL').fill('http://chatgpt.com/c/1');
    await dialog.getByRole('button', {name: '保存'}).click();
    await expect(row.getByText('https: で始まるアドレスだけを使えます。')).toBeVisible();
    await expect(row.getByLabel('URL')).toBeFocused();
    await row.getByLabel('URL').fill('https://chatgpt.com/c/1');
    await dialog.getByRole('button', {name: '保存'}).click();
    await expect(dialog).toHaveCount(0);
    await expect(agents).toBeFocused();

    await page.reload();
    await agents.click();
    await expect(menu.getByRole('menuitem')).toHaveText(['Claude', '前回の会話', 'AI エージェント設定…']);
    await menu.getByRole('menuitem', {name: '前回の会話'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-agent', 'https://chatgpt.com/c/1');
    await agents.click();
    await menu.getByRole('menuitem', {name: 'AI エージェント設定…'}).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(agents).toBeFocused();
});
