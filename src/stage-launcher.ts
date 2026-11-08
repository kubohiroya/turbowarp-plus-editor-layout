import React, {createElement as element, type ComponentType} from 'react';
import {createPortal} from 'react-dom';

const labels = {
    ja: {
        open: 'ステージを開く',
        menu: 'ステージの開き方',
        window: '別ウィンドウで開く',
        fullscreen: '別ウィンドウで全画面で開く',
        tab: 'ステージをタブで開く',
        drawer: 'ステージを引き出しで開く',
        enterFullscreen: '全画面にする'
    },
    en: {
        open: 'Open stage',
        menu: 'Stage opening options',
        window: 'Open in a separate window',
        fullscreen: 'Open fullscreen in a separate window',
        tab: 'Open stage in a tab',
        drawer: 'Open stage in the drawer',
        enterFullscreen: 'Enter fullscreen'
    }
};

const modes = ['window', 'fullscreen', 'tab', 'drawer'] as const;
type StageMode = typeof modes[number];
const textFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;

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
    onSelect(): void;
}

export interface StageLauncherOptions {
    mount: HTMLElement;
    styles: Record<string, string>;
    MenuButton: ComponentType<{label: string; icon: React.ReactNode; items: MenuItem[]; className: string}>;
}

interface StageLauncherProps {
    locale: string;
    options: StageLauncherOptions;
    dockAction?: StageDockAction;
    tab?: {docked: boolean; commands: {open(): void} | null};
    drawerOpen: boolean;
    focusDrawer(): void;
    revealStage(): void;
}

export function StageLauncher({locale, options, dockAction, tab, drawerOpen, focusDrawer, revealStage}: StageLauncherProps) {
    const [fullscreen, setFullscreen] = React.useState(false);
    const exitFullscreen = React.useCallback(() => setFullscreen(false), []);
    const {styles, MenuButton} = options;
    const text = textFor(locale);
    const separate = dockAction?.kind === 'opening' || dockAction?.kind === 'external';
    const child = separate ? dockAction.mount?.ownerDocument : undefined;
    const mode = separate ? (fullscreen ? 'fullscreen' : 'window') :
        (tab?.docked ? 'tab' : (drawerOpen ? 'drawer' : null));
    const available = {
        window: Boolean(dockAction?.external),
        fullscreen: Boolean(dockAction?.external),
        tab: Boolean(tab?.commands),
        drawer: true
    };

    React.useLayoutEffect(() => {
        if (!separate) setFullscreen(false);
    }, [separate]);

    function activate(target: StageMode) {
        if (mode && target !== mode) return;
        if (separate) {
            child?.defaultView?.focus();
            return;
        }
        if (!available[target]) return;
        revealStage();
        if (target === 'drawer') focusDrawer();
        else if (target === 'tab') tab?.commands?.open();
        else {
            setFullscreen(target === 'fullscreen');
            // Keep opening the popup on the original user gesture.
            dockAction?.undock();
        }
    }

    return element(React.Fragment, null,
        element('div', {className: styles.stageLauncher},
            element('button', {
                type: 'button',
                className: styles.stageLauncherAction,
                disabled: !mode && !available.window,
                onClick: () => activate(mode ?? 'window')
            }, text[mode ?? 'open']),
            element(MenuButton, {label: text.menu, icon: '▾', className: styles.stageLauncherMenu, items: modes.map(id => ({
                id, label: text[id], current: mode === id, disabled: mode ? mode !== id : !available[id],
                onSelect: () => activate(id)
            }))})),
        mode === 'fullscreen' && dockAction?.mount &&
            element(PopupFullscreen, {mount: dockAction.mount, label: text.enterFullscreen,
                className: styles.stageFullscreenPrompt, onExit: exitFullscreen}));
}

function PopupFullscreen({mount, label, className, onExit}: {
    mount: HTMLElement;
    label: string;
    className: string;
    onExit(): void;
}) {
    const child = mount.ownerDocument;
    const [needsGesture, setNeedsGesture] = React.useState(false);
    const enter = React.useCallback(async () => {
        try {
            if (!child.fullscreenElement) await child.documentElement.requestFullscreen();
            setNeedsGesture(false);
        } catch {
            setNeedsGesture(true);
        }
    }, [child]);

    React.useEffect(() => {void enter();}, [enter]);
    React.useEffect(() => {
        let wasFullscreen = Boolean(child.fullscreenElement);
        const changed = () => {
            if (child.fullscreenElement) wasFullscreen = true;
            else if (wasFullscreen) onExit();
        };
        child.addEventListener('fullscreenchange', changed);
        return () => child.removeEventListener('fullscreenchange', changed);
    }, [child, onExit]);

    // Mount a separate React portal so the child document receives the trusted click.
    return needsGesture ? createPortal(
        element('button', {type: 'button', className, onClick: enter}, label), mount
    ) : null;
}
