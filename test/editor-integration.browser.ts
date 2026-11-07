import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const pinned = process.env.TW_PLUS_LAYOUT_EDITOR_URL;
const fileMenuPreview = process.env.TW_PLUS_LAYOUT_FILE_MENU_URL || pinned;

function withFlags(base: string, flags: Record<string, string>) {
    const url = new URL(base);
    for (const [key, value] of Object.entries({lang: 'ja', ...flags})) url.searchParams.set(key, value);
    return url.href;
}

test('the sprite tab header shares theme colors and marks the selected tab',
    {skip: !pinned, timeout: 30_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}, colorScheme: 'light'});
        const menuBar = page.locator('[class*="gui_menu-bar-position_"]');
        const group = page.locator('.dv-groupview.dv-active-group');
        const tabStrip = group.locator('.dv-tabs-and-actions-container');
        const selectedTab = group.locator('.dv-tab.dv-active-tab');
        const inactiveLabel = group.locator('.dv-inactive-tab .dv-default-tab-content');
        const toolbar = group.locator('.tw-plus-sprite-toolbar-sections');

        await page.goto(withFlags(pinned, {}));
        await expect(toolbar).toBeVisible();
        await page.evaluate(async () => {
            const original = window.vm.editingTarget.id;
            await window.vm.duplicateSprite(original);
            window.vm.setEditingTarget(original);
        });
        await expect(inactiveLabel).toHaveCSS('color', 'rgb(107, 107, 107)');
        await expect(selectedTab).toHaveCSS('box-shadow', /rgb\(214, 59, 59\).*inset/);
        await expect(menuBar).toHaveCSS('background-color', await tabStrip.evaluate(el => getComputedStyle(el).backgroundColor));
        await expect(toolbar).toHaveCSS('background-color', await selectedTab.evaluate(el => getComputedStyle(el).backgroundColor));

        await page.emulateMedia({colorScheme: 'dark'});
        await expect(selectedTab).toHaveCSS('background-color', 'rgb(17, 17, 17)');
        await expect(tabStrip).toHaveCSS('background-color', 'rgb(51, 51, 51)');
        await expect(menuBar).toHaveCSS('background-color', 'rgb(51, 51, 51)');
        await expect(toolbar).toHaveCSS('background-color', 'rgb(17, 17, 17)');
        await expect(inactiveLabel).toHaveCSS('color', 'rgb(170, 170, 170)');
        await inactiveLabel.click();
        await expect(selectedTab).toHaveCSS('box-shadow', /rgb\(214, 59, 59\).*inset/);
        await expect(group.locator('.dv-tab.dv-inactive-tab')).toHaveCSS('box-shadow', 'none');

        await page.goto(withFlags(pinned, {twPlusDockviewSpriteTabs: '0'}));
        await expect(toolbar).toHaveCount(0);
        await expect(menuBar).toHaveCSS('background-color', 'rgb(51, 51, 51)');
    });

test('the pinned GUI uses its existing editor slots for Dockview sprite tabs',
    {skip: !pinned, timeout: 45_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}});
        const dockviewTabs = page.locator('.dv-tab');
        const extensionButton = page.locator('button[class*="gui_extension-button_"]');

        await page.goto(withFlags(pinned, {twPlusDockviewSpriteTabs: '0', twPlusExtensionFileMenu: '0'}));
        await expect(extensionButton).toBeVisible();
        await expect(dockviewTabs).toHaveCount(0);
        await page.goto(withFlags(pinned, {}));
        await page.waitForFunction(() => window.vm?.editingTarget?.isOriginal && window.ScratchBlocks?.getMainWorkspace());
        await expect(extensionButton).toHaveCount(0);
        const [first, second] = await page.evaluate(async () => {
            const {vm, ScratchBlocks} = window;
            const first = vm.editingTarget.id;
            vm.renameSprite(first, 'ダンゴ');
            await vm.duplicateSprite(first);
            const second = vm.editingTarget.id;
            vm.renameSprite(second, 'ミント');
            vm.setEditingTarget(first);
            ScratchBlocks.getMainWorkspace().getInjectionDiv().dataset.spriteTabsWorkspace = 'original';
            return [first, second];
        });
        const firstTab = dockviewTabs.filter({hasText: 'ダンゴ'});
        const originalSecondTab = dockviewTabs.filter({hasText: 'ミント'});
        await expect(firstTab).toBeVisible();
        await expect(originalSecondTab).toBeVisible();

        const rename = page.getByRole('menuitem', {name: 'スプライト名の変更'});
        const renameDialog = page.getByRole('dialog', {name: 'スプライト名の変更'});
        const name = renameDialog.getByRole('textbox', {name: 'スプライト名'});
        await originalSecondTab.getByText('ミント', {exact: true}).click({button: 'right'});
        await rename.click();
        await expect(name).toHaveValue('ミント');
        await renameDialog.getByRole('button', {name: 'キャンセル'}).click();
        await expect(originalSecondTab).toBeVisible();

        const icon = originalSecondTab.locator('.tw-plus-sprite-tab-icon');
        await expect(icon).toBeVisible();
        await icon.click({button: 'right'});
        await rename.click();
        await expect(name).toBeFocused();
        await name.fill('ライム');
        await name.press('Enter');
        await expect(renameDialog).toHaveCount(0);
        await expect.poll(() => page.evaluate(id => window.vm.runtime.getTargetById(id).getName(), second)).toBe('ライム');
        await expect.poll(() => page.evaluate(() => window.vm.editingTarget.id)).toBe(first);
        await expect(originalSecondTab).toHaveCount(0);

        const secondTab = dockviewTabs.filter({hasText: 'ライム'});
        const secondBounds = await secondTab.boundingBox();
        const preview = await firstTab.evaluateHandle(tab => {
            const iconSize = (element: Element) => {
                const {width, height} = element.querySelector('.tw-plus-sprite-tab-icon').getBoundingClientRect();
                return {width, height};
            };
            const sizes = {tab: iconSize(tab), preview: undefined as ReturnType<typeof iconSize> | undefined};
            tab.addEventListener('dragstart', (event: DragEvent) => {
                const transfer = event.dataTransfer;
                const setDragImage = transfer.setDragImage.bind(transfer);
                transfer.setDragImage = (element, x, y) => {
                    sizes.preview = iconSize(element);
                    setDragImage(element, x, y);
                };
            }, {capture: true, once: true});
            return sizes;
        });
        await firstTab.dragTo(secondTab, {targetPosition: {x: secondBounds.width - 5, y: secondBounds.height / 2}});
        const sizes = await preview.jsonValue();
        await preview.dispose();
        assert.deepEqual(sizes.preview, sizes.tab, 'The drag preview keeps the sprite icon at tab size');
        await expect(dockviewTabs).toHaveText(['ライム', 'ダンゴ']);
        await firstTab.click();
        await expect.poll(() => page.evaluate(() => window.vm.editingTarget.id)).toBe(first);

        const editor = page.locator('.dv-content-container');
        const costumes = editor.getByRole('tab', {name: 'コスチューム', exact: true});
        const code = editor.getByRole('tab', {name: 'コード', exact: true});
        await costumes.click();
        await expect(costumes).toHaveAttribute('aria-selected', 'true');
        await secondTab.click();
        await expect.poll(() => page.evaluate(() => window.vm.editingTarget.id)).toBe(second);
        await code.click();
        await firstTab.click();
        await expect.poll(() => page.evaluate(() => window.vm.editingTarget.id)).toBe(first);
        await expect(costumes).toHaveAttribute('aria-selected', 'true');
        await code.click();
        await expect(editor.locator('.blocklySvg').first()).toBeVisible();
        assert.equal(await page.evaluate(() => window.ScratchBlocks.getMainWorkspace().getInjectionDiv()
            .dataset.spriteTabsWorkspace), 'original');
        await firstTab.locator('.dv-default-tab-action').click();
        await expect(firstTab).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.vm.editingTarget.id)).toBe(second);
        await page.getByText('ダンゴ', {exact: true}).first().click();
        await expect(firstTab).toBeVisible();

        const stageName = await page.evaluate(() => {
            const stage = window.vm.runtime.getTargetForStage();
            window.vm.setEditingTarget(stage.id);
            return stage.getName();
        });
        const backdrops = editor.getByRole('tab', {name: '背景', exact: true});
        await backdrops.hover();
        await expect(editor.locator('.tw-plus-sprite-toolbar-tooltip')).toHaveText('背景');
        await backdrops.click();
        await expect(backdrops).toHaveAttribute('aria-selected', 'true');
        await dockviewTabs.getByText(stageName, {exact: true}).click({button: 'right'});
        await expect(rename).toHaveCount(0);
    });

test('the pinned GUI File menu moves the extension command and decorates stock entries',
    {skip: !fileMenuPreview, timeout: 30_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}});
        const extensionButton = page.locator('button[class*="gui_extension-button_"]');
        const file = page.getByText('ファイル', {exact: true}).first();
        const add = page.getByText('機能拡張の追加', {exact: true});

        await page.goto(withFlags(fileMenuPreview, {twPlusExtensionFileMenu: '0'}));
        await expect(extensionButton).toBeVisible();
        await file.click();
        await expect(add).toHaveCount(0);
        await expect(page.locator('[data-file-menu-icon]')).toHaveCount(0);

        await page.goto(withFlags(fileMenuPreview, {}));
        await expect(extensionButton).toHaveCount(0);
        await expect(page.locator('.dv-tab').first()).toBeVisible();
        await file.click();
        const openMenu = add.locator('xpath=ancestor::ul[1]');
        await expect(openMenu.locator('li:not(:has([data-file-menu-icon]))')).toHaveCount(0);
        await expect(openMenu.locator('[data-file-menu-icon="extension"]')).toBeVisible();
        await add.press('Enter');
        await expect(page.getByText('機能拡張を作品に追加する', {exact: true}).first()).toBeVisible();
    });
