import React from 'react';
import type {StageDrawerLayout} from './workspace-layout.ts';

type StageCommands = {open(): void; close(): void};

export interface DockviewStagePane {
    title: string;
    attach(destination: HTMLElement | null): void;
    connect(commands: StageCommands | null): void;
    drawer?: {
        read(): StageDrawerLayout | undefined;
        restore(layout?: StageDrawerLayout): void;
        subscribe(listener: () => void): () => void;
    };
}

export function useDockviewStage(enabled: boolean, locale: string) {
    const [surface] = React.useState(() => {
        if (!enabled) return null;
        const node = document.createElement('div');
        node.className = 'tw-plus-dockview-stage-surface';
        return node;
    });
    const inline = React.useRef<HTMLElement>(null);
    const dock = React.useRef<HTMLElement>(null);
    const suspended = React.useRef(false);
    const [docked, setDocked] = React.useState(false);
    const [commands, setCommands] = React.useState<StageCommands>(null);
    const [drawerLayout, setDrawerLayout] = React.useState<StageDrawerLayout>();
    const savedDrawer = React.useRef<StageDrawerLayout>();
    const drawerListeners = React.useMemo(() => new Set<() => void>(), []);
    const restoreDrawer = React.useCallback((layout?: StageDrawerLayout) => {
        savedDrawer.current = layout;
        setDrawerLayout(layout);
    }, []);
    const updateDrawer = React.useCallback((patch: Partial<StageDrawerLayout>) => {
        const previous = savedDrawer.current;
        const next = {open: false, selected: false, ...previous, ...patch};
        if (next.open === Boolean(previous?.open) && next.selected === Boolean(previous?.selected) &&
            next.position === previous?.position && next.width === previous?.width) return;
        restoreDrawer(next.open || next.selected || next.position || next.width ? next : undefined);
        for (const listener of drawerListeners) listener();
    }, [drawerListeners, restoreDrawer]);
    const resetDrawerPresentation = React.useCallback(() => updateDrawer({open: false, selected: false}),
        [updateDrawer]);

    const move = React.useCallback(() => {
        const destination = suspended.current ? inline.current : dock.current ?? inline.current;
        if (surface && destination && surface.parentElement !== destination) destination.appendChild(surface);
    }, [surface]);
    const inlineRef = React.useCallback((element: HTMLElement | null) => {
        inline.current = element;
        if (surface && element) surface.dir = element.closest('[dir]')?.getAttribute('dir') ?? '';
        move();
    }, [move, surface]);
    const suspend = React.useCallback((value: boolean) => {
        suspended.current = value;
        move();
    }, [move]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const pane = React.useMemo<DockviewStagePane>(() => ({
        title: japanese ? 'ステージ' : 'Stage',
        attach(destination) {
            dock.current = destination;
            move();
            setDocked(Boolean(destination));
        },
        connect: setCommands,
        drawer: {
            read: () => savedDrawer.current,
            restore: restoreDrawer,
            subscribe(listener) {
                drawerListeners.add(listener);
                return () => {drawerListeners.delete(listener);};
            }
        }
    }), [japanese, move, restoreDrawer, drawerListeners]);
    return surface && {
        surface, pane, docked, commands, inlineRef, suspend, drawerLayout, updateDrawer, resetDrawerPresentation,
        openLabel: japanese ? 'ステージをタブで開く' : 'Open stage in workspace',
        closeLabel: japanese ? 'ステージを元の位置に戻す' : 'Return stage from workspace'
    };
}
