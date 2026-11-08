import type {Context, ElementType} from 'react';
import {createPortal} from 'react-dom';
import type {useDockviewStage} from './dockview-stage.ts';
import {createDockview, themeLight} from 'dockview';
import {StageLauncher, type StageDockAction, type StageLauncherOptions} from './stage-launcher.ts';

export type {StageDockAction, StageLauncherOptions} from './stage-launcher.ts';

interface StageWindowConnection<Target> {
    ready: Promise<Target>;
    disconnected: AbortSignal;
    close(): void;
}

interface StageWindowHost<Request, Target> {
    open(request: Request): StageWindowConnection<Target> | null;
}

export function createStagePopoutHost<Request, Target extends {mount: HTMLElement}>(
    host: StageWindowHost<Request, Target>, title: string
): StageWindowHost<Request, Target> {
    return {
        open(request) {
            const connection = host.open(request);
            if (!connection) return null;

            const disconnected = new AbortController();
            const disconnect = () => disconnected.abort();
            connection.disconnected.addEventListener('abort', disconnect, {once: true});
            if (connection.disconnected.aborted) disconnect();

            let dockview: ReturnType<typeof createDockview> | undefined;
            let removed: {dispose(): void} | undefined;
            let closed = false;
            const ready = connection.ready.then(target => {
                if (closed || disconnected.signal.aborted) throw new Error('Stage window closed');
                const content = target.mount.ownerDocument.createElement('div');
                Object.assign(content.style, {width: '100%', height: '100%'});
                dockview = createDockview(target.mount, {
                    createComponent: () => ({element: content, init() {}}),
                    theme: themeLight,
                    disableDnd: true,
                    disableFloatingGroups: true
                });
                dockview.addPanel({id: 'stage', component: 'stage', title});
                removed = dockview.onDidRemovePanel(disconnect);
                return {...target, mount: content};
            });

            return {
                ready,
                disconnected: disconnected.signal,
                close() {
                    if (closed) return;
                    closed = true;
                    connection.disconnected.removeEventListener('abort', disconnect);
                    try {
                        removed?.dispose();
                        dockview?.dispose();
                    } finally {
                        connection.close();
                    }
                }
            };
        }
    };
}

const isJapanese = (locale: string) => /^ja(?:-|$)/i.test(locale);

export function stageFullscreenLabel(locale: string, fallback: string) {
    return isJapanese(locale) ? 'ステージを全画面表示にする' : fallback;
}

export function stageDockActionLabel(locale: string, {drawer, detached, external}: {
    drawer?: boolean;
    detached: boolean;
    external?: boolean;
}) {
    const japanese = isJapanese(locale);
    if (detached) return japanese ? 'ステージをエディターに戻す' : 'Dock stage';
    if (external) return japanese ? (drawer ? 'ステージを別ウィンドウで開く' : '別ウィンドウで開く') : 'Open in a separate window';
    return japanese ? 'アンドック' : 'Undock stage';
}

type StagePlacement = Pick<NonNullable<ReturnType<typeof useDockviewStage>>, 'surface' | 'inlineRef' | 'docked'> &
    Partial<Pick<NonNullable<ReturnType<typeof useDockviewStage>>, 'commands'>>;

export function createStageSurface(React: typeof import('react'), {
    context, EdgeDrawer, Panel
}: {
    context: Context<{
        locale: string;
        stageDrawer?: boolean;
        stageHidden?: boolean;
        setStageDrawerOpen?(open: boolean): void;
        setStageVisible?(visible: boolean): void;
    }>;
    EdgeDrawer: ElementType;
    Panel: ElementType;
}) {
    return function StageSurface({externalHost, onDockActionChange, placement, dockAction, launcher, ...props}: {
        placement?: StagePlacement;
        dockAction?: StageDockAction;
        launcher?: StageLauncherOptions;
        [key: string]: any;
    }) {
        const {locale, stageDrawer, stageHidden, setStageDrawerOpen, setStageVisible} = React.useContext(context);
        const [drawerOpen, setDrawerOpen] = React.useState(false);
        const focusDrawer = React.useRef<() => void>(null);
        const onOpenChange = React.useCallback((open: boolean) => {
            setStageDrawerOpen?.(open);
            setDrawerOpen(open);
        }, [setStageDrawerOpen]);
        const japanese = isJapanese(locale);
        const title = japanese ? 'ステージ' : 'Stage';
        const host = React.useMemo(() => stageDrawer && externalHost ?
            createStagePopoutHost(externalHost, title) : externalHost, [stageDrawer, externalHost, title]);
        const panel = React.createElement(Panel, {
            ...props,
            id: 'stage',
            title,
            externalHost: host,
            externalOnly: stageDrawer,
            onDockActionChange: stageDrawer && !host ? undefined : onDockActionChange
        });
        const inline = placement ? React.createElement('div', {
            ref: placement.inlineRef,
            'data-stage-in-workspace': placement.docked || undefined
        }) : panel;
        const dock = stageDrawer ? React.createElement(EdgeDrawer, {
            edge: 'right',
            label: japanese ? 'ステージを展開' : 'Reveal stage',
            onOpenChange,
            focusPanelRef: launcher ? focusDrawer : undefined,
            focusBoundary: launcher?.mount,
            portalContent: Boolean(placement),
            holdOpenSelector: '[data-turbowarp-app-shell-source-chooser][role="dialog"][aria-modal="true"]'
        }, inline) : inline;
        const launcherView = stageDrawer && launcher ? createPortal(React.createElement(StageLauncher, {
            locale, options: launcher, dockAction,
            tab: placement?.commands ? {docked: placement.docked, commands: placement.commands} : undefined,
            drawerOpen: drawerOpen && !stageHidden,
            focusDrawer: () => focusDrawer.current?.(),
            revealStage: () => {if (stageHidden) setStageVisible?.(true);}
        }), launcher.mount) : null;
        return React.createElement(React.Fragment, null, dock,
            placement && createPortal(panel, placement.surface), launcherView);
    };
}
