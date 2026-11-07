interface SpriteLayoutCommands {
    splitRight(): void;
    splitBelow(): void;
    close(): void;
    canClose(): boolean;
    canSplit?(): boolean;
    openPanel?(): void;
    canOpenPanel?(): boolean;
    openPalette?(): void;
    canOpenPalette?(): boolean;
}

const labels = {
    ja: ['編集パネルのレイアウト', 'パネルを横に分割', 'パネルを縦に分割', 'この分割パネルを閉じる',
        'パネルを別画面で開く', 'ブロックパレットを別画面で開く'],
    en: ['Editor panel layout', 'Split right', 'Split below', 'Close this split',
        'Open panel in another window', 'Open block palette in another window']
};

function createIcon(document: Document, path: string) {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.4');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('stroke-linecap', 'round');
    const shape = document.createElementNS(ns, 'path');
    shape.setAttribute('d', path);
    icon.append(shape);
    return icon;
}

export function createSpriteLayoutMenu(document: Document, locale: string, commands: SpriteLayoutCommands) {
    const [title, right, below, closeLabel, panelLabel, paletteLabel] = /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;
    const element = document.createElement('div');
    element.className = 'tw-plus-sprite-layout-menu';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tw-plus-sprite-layout-menu-trigger';
    trigger.title = title;
    trigger.setAttribute('aria-label', title);
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(createIcon(document, 'M2.5 3.5h11v9h-11zM2.5 6.5h11m-7 0v6'));
    element.append(trigger);

    const popup = document.createElement('div');
    popup.className = 'tw-plus-sprite-layout-menu-popup';
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', title);
    const items = [
        {label: right, run: commands.splitRight, enabled: commands.canSplit, path: 'M2.5 3.5h11v9h-11zM8 3.5v9'},
        {label: below, run: commands.splitBelow, enabled: commands.canSplit, path: 'M2.5 3.5h11v9h-11zM2.5 8h11'},
        {label: closeLabel, run: commands.close, enabled: commands.canClose, path: 'm4.5 4.5 7 7m0-7-7 7'},
        {label: panelLabel, run: commands.openPanel, enabled: commands.canOpenPanel, path: 'M7 3H3v10h10V9m-5-1 5-5m-4 0h4v4'},
        {label: paletteLabel, run: commands.openPalette, enabled: commands.canOpenPalette,
            path: 'M7 4H3v3h2v2H3v3h7v-2h2V9m-3-2 4-4m-3 0h3v3'}
    ];
    const entries = items.flatMap(({label, run, enabled, path}) => {
        if (!run) return [];
        const item = document.createElement('button');
        item.type = 'button';
        item.append(createIcon(document, path), label);
        item.tabIndex = -1;
        item.setAttribute('role', 'menuitem');
        item.addEventListener('click', () => {
            close(true);
            run();
        });
        return [{item, enabled}];
    });
    const buttons = entries.map(({item}) => item);
    popup.append(...buttons);
    let openedIn: Document | undefined;
    let topLayer = false;

    function close(restoreFocus = false) {
        if (!openedIn) return;
        openedIn.removeEventListener('pointerdown', dismiss, true);
        openedIn = undefined;
        if (topLayer && popup.matches(':popover-open')) popup.hidePopover();
        popup.remove();
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) trigger.focus({preventScroll: true});
    }

    function dismiss(event: PointerEvent) {
        const node = event.target as Node;
        if (!trigger.contains(node) && !popup.contains(node)) close();
    }

    function open(last = false) {
        if (openedIn) return;
        openedIn = trigger.ownerDocument;
        for (const {item, enabled} of entries) item.disabled = enabled?.() === false;
        topLayer = typeof popup.showPopover === 'function';
        if (topLayer) {
            popup.setAttribute('popover', 'manual');
            element.append(popup);
            popup.showPopover();
        } else {
            openedIn.body.append(popup);
        }
        const anchor = trigger.getBoundingClientRect();
        const viewport = openedIn.documentElement;
        const {width, height} = popup.getBoundingClientRect();
        popup.style.left = Math.max(4, Math.min(anchor.right - width, viewport.clientWidth - width - 4)) + 'px';
        popup.style.top = (anchor.bottom + height + 8 <= viewport.clientHeight ? anchor.bottom + 4 :
            Math.max(4, anchor.top - height - 4)) + 'px';
        trigger.setAttribute('aria-expanded', 'true');
        openedIn.addEventListener('pointerdown', dismiss, true);
        const enabled = buttons.filter(button => !button.disabled);
        enabled[last ? enabled.length - 1 : 0]?.focus({preventScroll: true});
    }

    trigger.addEventListener('click', () => openedIn ? close(true) : open());
    trigger.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        open(event.key === 'ArrowUp');
    });
    popup.addEventListener('focusout', event => {
        if (!popup.contains(event.relatedTarget as Node)) close();
    });
    popup.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close(true);
            return;
        }
        const enabled = buttons.filter(button => !button.disabled);
        const index = enabled.indexOf(event.target as HTMLButtonElement);
        const next = {ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: enabled.length - 1}[event.key];
        if (next === undefined) return;
        event.preventDefault();
        enabled[(next + enabled.length) % enabled.length]?.focus({preventScroll: true});
    });
    return {element, dispose: () => close()};
}
