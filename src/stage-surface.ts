import type {Context, ElementType} from 'react';
import {createPortal} from 'react-dom';
import type {useDockviewStage} from './dockview-stage.ts';
import {createDockview, themeLight} from 'dockview';
import {StageLauncher, type StageDockAction, type StageLauncherOptions} from './stage-launcher.ts';

export type {StageDockAction, StageLauncherOptions} from './stage-launcher.ts';
export {stageDrawerPinItem, stagePresentationItems, useStageDocumentFullscreen} from './stage-launcher.ts';
export {StageResizeHandle} from './stage-resize-handle.ts';

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
            let resized: {disconnect(): void} | undefined;
            let closed = false;
            const ready = connection.ready.then(target => {
                if (closed || disconnected.signal.aborted) throw new Error('Stage window closed');
                const {mount} = target;
                const content = mount.ownerDocument.createElement('div');
                Object.assign(content.style, {width: '100%', height: '100%'});
                const view = createDockview(mount, {
                    createComponent: () => ({element: content, init() {}}),
                    theme: themeLight,
                    disableDnd: true,
                    disableFloatingGroups: true,
                    // Dockview's own observer belongs to the editor window and does not see this one resize.
                    disableAutoResizing: true
                });
                dockview = view;
                const group = view.addGroup({direction: 'right', hideHeader: true});
                view.addPanel({id: 'stage', component: 'stage', title, position: {referenceGroup: group}});
                removed = view.onDidRemovePanel(disconnect);
                const layout = () => {
                    if (mount.clientWidth > 0 && mount.clientHeight > 0) view.layout(mount.clientWidth, mount.clientHeight);
                };
                const Observer = mount.ownerDocument.defaultView?.ResizeObserver;
                if (Observer) {
                    const observer = new Observer(layout);
                    observer.observe(mount);
                    resized = observer;
                }
                layout();
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
                        resized?.disconnect();
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
    Partial<Pick<NonNullable<ReturnType<typeof useDockviewStage>>,
        'commands' | 'drawerLayout' | 'updateDrawer' | 'resetDrawerPresentation'>>;

export function createStageSurface(React: typeof import('react'), {
    context, EdgeDrawer, Panel
}: {
    context: Context<{
        locale: string;
        stageDrawer?: boolean;
        stageDrawerPinned?: boolean;
        stageHidden?: boolean;
        setStageDrawerOpen?(open: boolean): void;
        setStageVisible?(visible: boolean): void;
    }>;
    EdgeDrawer: ElementType;
    Panel: ElementType;
}) {
    return function StageSurface({externalHost, onDockActionChange, placement, dockAction, launcher,
        openDrawerRef, closeDrawerRef, editorFullscreen, ...props}: {
        placement?: StagePlacement;
        dockAction?: StageDockAction;
        launcher?: StageLauncherOptions;
        openDrawerRef?: {current: (() => void) | null};
        closeDrawerRef?: {current: (() => void) | null};
        editorFullscreen?: boolean;
        [key: string]: any;
    }) {
        const {locale, stageDrawer, stageDrawerPinned = true, stageHidden, setStageDrawerOpen, setStageVisible} =
            React.useContext(context);
        const [drawerOpen, setDrawerOpen] = React.useState(false);
        const localDrawerRef = React.useRef<() => void>(null);
        const focusDrawer = openDrawerRef ?? localDrawerRef;
        const updateDrawer = placement?.updateDrawer;
        const resetDrawerPresentation = placement?.resetDrawerPresentation;
        const drawerLayout = placement?.drawerLayout;
        const stageOutsideDrawer = Boolean(editorFullscreen || dockAction?.kind === 'external' || placement?.docked);
        React.useLayoutEffect(() => {
            if (stageOutsideDrawer) resetDrawerPresentation?.();
        }, [stageOutsideDrawer, resetDrawerPresentation, drawerLayout?.open, drawerLayout?.selected]);
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
            movableStage: true,
            keepOpenOnBlur: stageDrawerPinned,
            available: !placement?.docked && (!dockAction || dockAction.kind === 'docked'),
            stageDrawerLayout: drawerLayout,
            updateStageDrawer: updateDrawer,
            label: japanese ? 'ステージを展開' : 'Reveal stage',
            onOpenChange,
            focusPanelRef: launcher ? focusDrawer : undefined,
            closePanelRef: launcher ? closeDrawerRef : undefined,
            focusBoundary: launcher?.mount,
            // With the launcher, the handle appears after the drawer has been opened once.
            showTrigger: !launcher,
            portalContent: Boolean(placement),
            holdOpenSelector: '[data-turbowarp-app-shell-source-chooser][role="dialog"][aria-modal="true"]'
        }, inline) : inline;
        const launcherView = launcher && (stageDrawer || editorFullscreen) ? createPortal(React.createElement(StageLauncher, {
            locale, options: launcher, dockAction,
            tab: placement?.commands ? {docked: placement.docked, commands: placement.commands} : undefined,
            drawerOpen: stageDrawer && drawerOpen && !stageHidden,
            savedDrawerSelected: updateDrawer ? Boolean(drawerLayout?.selected) : undefined,
            editorFullscreen,
            focusDrawer: () => focusDrawer.current?.(),
            revealStage: () => {if (stageHidden) setStageVisible?.(true);}
        }), launcher.mount) : null;
        return React.createElement(React.Fragment, null, dock,
            placement && createPortal(panel, placement.surface), launcherView);
    };
}
