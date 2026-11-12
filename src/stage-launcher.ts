import React, {createElement as element, type ComponentType} from 'react';
import {drawerPinIcon} from './drawer-views.ts';

const labels = {
    ja: {
        open: 'ステージを開く',
        menu: 'ステージの開き方',
        window: '別ウィンドウで表示',
        tab: 'タブで表示',
        drawer: '引出しで表示',
        pinDrawer: '引出しを常時表示する',
        autoHideDrawer: '引出しを自動的に隠す'
    },
    en: {
        open: 'Open stage',
        menu: 'Stage opening options',
        window: 'Show in a separate window',
        tab: 'Show in a tab',
        drawer: 'Show in the drawer',
        pinDrawer: 'Keep the drawer open',
        autoHideDrawer: 'Automatically hide the drawer'
    }
};

const modes = ['window', 'tab', 'drawer'] as const;
type StageMode = typeof modes[number];
const textFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;
const icons: Record<StageMode, string> = {
    window: 'M7 3H3v10h10V9m-5-1 5-5m-4 0h4v4',
    tab: 'M2.5 6V3.5H7L8.5 6h5v6.5h-11zM2.5 6H9',
    drawer: 'M2.5 3.5h11v9h-11zM10.5 3.5v9M8.5 8h-4m1.5-1.5L4.5 8 6 9.5'
};

export function stagePresentationItems(locale: string, current: StageMode | null,
    actions: Partial<Record<StageMode, () => void>>): MenuItem[] {
    const text = textFor(locale);
    return modes.map(id => ({
        id, label: text[id], current: current === id, disabled: !actions[id], onSelect: actions[id],
        icon: element('svg', {viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
            strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true}, element('path', {d: icons[id]}))
    }));
}

export function stageDrawerPinItem(locale: string, pinned: boolean, setPinned: (pinned: boolean) => void) {
    const text = textFor(locale);
    return {
        id: 'drawer-pin',
        label: pinned ? text.autoHideDrawer : text.pinDrawer,
        icon: drawerPinIcon(element, !pinned),
        onSelect: () => setPinned(!pinned)
    };
}

export function useStageDocumentFullscreen(doc?: Document) {
    const [fullscreenDocument, setFullscreenDocument] = React.useState<Document>();
    React.useLayoutEffect(() => {
        const update = () => setFullscreenDocument(doc?.fullscreenElement ? doc : undefined);
        update();
        doc?.addEventListener('fullscreenchange', update);
        return () => doc?.removeEventListener('fullscreenchange', update);
    }, [doc]);
    return Boolean(doc && fullscreenDocument === doc);
}

export interface StageDockAction {
    kind: 'docked' | 'opening' | 'external';
    external: boolean;
    mount?: HTMLElement;
    undock(): void;
}

interface MenuItem {
    id: StageMode;
    label: string;
    current: boolean;
    disabled: boolean;
    icon: React.ReactNode;
    onSelect?(): void;
}

export interface StageLauncherOptions {
    mount: HTMLElement;
    styles: Record<string, string>;
    MenuButton: ComponentType<{label: string; icon: React.ReactNode; items: MenuItem[]; className: string; disabled?: boolean}>;
}

interface StageLauncherProps {
    locale: string;
    options: StageLauncherOptions;
    dockAction?: StageDockAction;
    tab?: {docked: boolean; commands: {open(): void} | null};
    drawerOpen: boolean;
    savedDrawerSelected?: boolean;
    editorFullscreen?: boolean;
    focusDrawer(): void;
    revealStage(): void;
}

export function StageLauncher({locale, options, dockAction, tab, drawerOpen, savedDrawerSelected, editorFullscreen,
    focusDrawer, revealStage}: StageLauncherProps) {
    const [localDrawerSelected, setLocalDrawerSelected] = React.useState(false);
    const drawerSelected = savedDrawerSelected ?? localDrawerSelected;
    const {styles, MenuButton} = options;
    const text = textFor(locale);
    const separate = dockAction?.kind === 'opening' || dockAction?.kind === 'external';
    const mode = separate ? 'window' : (tab?.docked ? 'tab' : (drawerOpen ? 'drawer' : null));
    const disabled = Boolean(editorFullscreen || mode);
    const available = {
        window: Boolean(dockAction?.external),
        tab: Boolean(tab?.commands),
        drawer: true
    };
    const defaultTarget = drawerSelected || !available.window ? 'drawer' : 'window';

    React.useLayoutEffect(() => {
        if (savedDrawerSelected === undefined && mode && !editorFullscreen) setLocalDrawerSelected(mode === 'drawer');
    }, [mode, editorFullscreen, savedDrawerSelected]);

    function activate(target: StageMode) {
        if (disabled || !available[target]) return;
        revealStage();
        if (target === 'drawer') focusDrawer();
        else if (target === 'tab') tab?.commands?.open();
        else dockAction?.undock();
    }

    const actions: Partial<Record<StageMode, () => void>> = {};
    for (const target of modes) {
        if (!disabled && available[target]) actions[target] = () => activate(target);
    }
    return element('div', {className: styles.stageLauncher},
            element('button', {
                type: 'button',
                className: styles.stageLauncherAction,
                disabled,
                onClick: () => activate(defaultTarget)
            }, text.open),
            element(MenuButton, {label: text.menu, icon: '▾', disabled,
                className: `${styles.stageLauncherMenu} ${styles.stagePresentationMenu}`,
                items: stagePresentationItems(locale, mode ?? (drawerSelected ? 'drawer' : null), actions)}));
}
