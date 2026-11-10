import type {ReactNode} from 'react';

/** The contents the left drawer can show. `sprites` is the GUI's sprite list and backdrop, always available. */
export type DrawerViewId = 'sprites' | 'project' | 'git-history';
/** The contents a host supplies. */
export type HostDrawerViewId = Exclude<DrawerViewId, 'sprites'>;

export interface DrawerRenderProps {
    /** The Editor locale, for example `ja` or `en`. */
    locale: string;
}

/** A drawer content supplied by the host. Its button appears only while the host supplies it. */
export interface DrawerView {
    id: HostDrawerViewId;
    /** The button's name. Defaults to the package's Japanese or English name for `id`. */
    label?: string;
    /** A 16 px inline icon drawn with `currentColor`. Defaults to the package's icon for `id`. */
    icon?: ReactNode;
    /** The content. Rendered only while the view is selected. */
    render(props: DrawerRenderProps): ReactNode;
    /** The view's own tools, shown where the sprite list shows search, pin and undock. */
    tools?(props: DrawerRenderProps): ReactNode;
}

export interface DrawerMenuRenderProps extends DrawerRenderProps {
    /** Close the menu and return focus to its button. */
    close(): void;
}

/** The AI agent menu supplied by the host. Opening it does not change the drawer's content. */
export interface DrawerMenu {
    label?: string;
    icon?: ReactNode;
    /** The menu content, normally one `role="menu"` element with `menuitem` children. */
    renderMenu(props: DrawerMenuRenderProps): ReactNode;
}

/** What the host passes to `StandardLayout` as `drawerViews`. */
export interface DrawerViews {
    views?: readonly DrawerView[];
    agents?: DrawerMenu;
}

export const drawerViewIds: readonly DrawerViewId[] = ['sprites', 'project', 'git-history'];
const hostIds = new Set<string>(drawerViewIds.slice(1));

const names = {
    sprites: ['スプライト一覧', 'Sprites'],
    project: ['プロジェクトフォルダ', 'Project folder'],
    'git-history': ['Git 履歴', 'Git history'],
    agents: ['AI エージェント', 'AI agents'],
    bar: ['ドロワーの表示', 'Drawer views']
} as const;

export const isJapanese = (locale: string) => /^ja(?:-|$)/i.test(locale ?? '');
export const drawerLabel = (id: keyof typeof names, locale: string) => names[id][isJapanese(locale) ? 0 : 1];

/** The supported host views in button order, without unknown or repeated ids. */
export function availableDrawerViews(drawerViews: DrawerViews | undefined): DrawerView[] {
    const views = drawerViews?.views ?? [];
    return drawerViewIds.slice(1).flatMap(id => {
        const view = views.find(candidate => candidate && candidate.id === id && hostIds.has(candidate.id) &&
            typeof candidate.render === 'function');
        return view ? [view] : [];
    });
}

/** The bar is shown only when the host supplies something besides the sprite list. */
export const hasDrawerBar = (drawerViews: DrawerViews | undefined) =>
    availableDrawerViews(drawerViews).length > 0 || typeof drawerViews?.agents?.renderMenu === 'function';

type DrawerStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const drawerViewKey = (storageKey: string) => `${storageKey}.drawer`;

/** The view selected last time, or `sprites`. The caller falls back to `sprites` while that view is unavailable. */
export function readDrawerView(storage: DrawerStorage | null | undefined, storageKey: string | undefined): DrawerViewId {
    if (!storage || !storageKey) return 'sprites';
    try {
        const saved = JSON.parse(storage.getItem(drawerViewKey(storageKey)) ?? 'null');
        if (saved?.version === 1 && drawerViewIds.includes(saved.view)) return saved.view;
    } catch {
        // Storage can be unavailable or contain obsolete data.
    }
    return 'sprites';
}

export function writeDrawerView(storage: DrawerStorage | null | undefined, storageKey: string | undefined, view: DrawerViewId) {
    if (!storage || !storageKey) return;
    try {
        storage.setItem(drawerViewKey(storageKey), JSON.stringify({version: 1, view}));
    } catch {
        // Keep the drawer usable when persistence is denied.
    }
}

let nextMenuId = 0;

export function createDrawerViewBar(React, styles) {
    const {createElement: element, useLayoutEffect, useRef, useState} = React;
    const svg = (...children) => element('svg', {
        'aria-hidden': true, focusable: false, width: 16, height: 16, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, ...children);
    const icons = {
        sprites: () => svg(element('rect', {x: 2, y: 2, width: 5, height: 5, rx: 1}),
            element('rect', {x: 9, y: 2, width: 5, height: 5, rx: 1}),
            element('rect', {x: 2, y: 9, width: 12, height: 5, rx: 1})),
        project: () => svg(element('path', {d: 'M1.5 4V13h13V5.5H8L6.5 3.5h-4A1 1 0 0 0 1.5 4.5Z'})),
        'git-history': () => svg(element('circle', {cx: 5, cy: 3.5, r: 1.5}), element('circle', {cx: 5, cy: 12.5, r: 1.5}),
            element('circle', {cx: 11, cy: 6.5, r: 1.5}), element('path', {d: 'M5 5v6M11 8c0 2.5-6 1.5-6 3'})),
        agents: () => svg(element('path', {d: 'M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z'}))
    };

    function AgentMenu({menu, locale, button, onFocus, onKeyDown, tabIndex}) {
        const [open, setOpen] = useState(false);
        const popup = useRef(null);
        const id = useRef(null);
        if (!id.current) id.current = `plus-drawer-agents-${++nextMenuId}`;
        const label = menu.label ?? drawerLabel('agents', locale);
        const close = (focus = true) => {
            setOpen(false);
            if (focus) button.current?.focus();
        };
        useLayoutEffect(() => {
            if (!open) return;
            const node = popup.current;
            node?.querySelector('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], button, a[href], input')
                ?.focus({preventScroll: true});
            const doc = node?.ownerDocument;
            const outside = event => {
                if (!node.contains(event.target) && !button.current?.contains(event.target)) close(false);
            };
            doc?.addEventListener('pointerdown', outside, true);
            return () => doc?.removeEventListener('pointerdown', outside, true);
        }, [open]);
        return element('div', {className: styles.drawerAgents},
            element('button', {
                type: 'button', ref: button, tabIndex, 'aria-label': label, title: label,
                'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id.current : undefined,
                'data-drawer-view': 'agents',
                onClick: () => setOpen(value => !value),
                onFocus, onKeyDown
            }, menu.icon ?? icons.agents()),
            open && element('div', {
                id: id.current, ref: popup, className: styles.drawerAgentsMenu,
                onKeyDown: event => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
            }, menu.renderMenu({locale, close: () => close()})));
    }

    /** The row of icon buttons at the top of the left drawer. */
    return function DrawerViewBar({locale, views, agents, selected, onSelect}) {
        const bar = useRef(null);
        const agentButton = useRef(null);
        const entries = [
            {id: 'sprites', label: drawerLabel('sprites', locale), icon: icons.sprites()},
            ...views.map(view => ({id: view.id, label: view.label ?? drawerLabel(view.id, locale),
                icon: view.icon ?? icons[view.id]()}))
        ];
        const count = entries.length + (agents ? 1 : 0);
        const [focused, setFocused] = useState(() => Math.max(0, entries.findIndex(entry => entry.id === selected)));
        const current = Math.min(focused, count - 1);
        const move = (event, index) => {
            const buttons = bar.current.querySelectorAll('[data-drawer-view]');
            const rtl = bar.current.ownerDocument.defaultView.getComputedStyle(bar.current).direction === 'rtl';
            const step = {ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1}[event.key];
            let next;
            if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = count - 1;
            else if (step) next = (index + step + count) % count;
            else return;
            event.preventDefault();
            setFocused(next);
            buttons[next]?.focus();
        };
        return element('div', {
            className: styles.drawerViewBar, role: 'toolbar', ref: bar,
            'aria-label': drawerLabel('bar', locale)
        },
        entries.map((entry, index) => element('button', {
            key: entry.id, type: 'button', 'data-drawer-view': entry.id,
            'aria-label': entry.label, title: entry.label, 'aria-pressed': entry.id === selected,
            tabIndex: index === current ? 0 : -1,
            onFocus: () => setFocused(index),
            onClick: () => onSelect(entry.id),
            onKeyDown: event => move(event, index)
        }, entry.icon)),
        agents && element(AgentMenu, {
            menu: agents, locale, button: agentButton,
            tabIndex: current === entries.length ? 0 : -1,
            onFocus: () => setFocused(entries.length),
            onKeyDown: event => move(event, entries.length)
        }));
    };
}
