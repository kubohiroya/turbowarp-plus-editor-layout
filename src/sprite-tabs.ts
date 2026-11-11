import React from 'react';
import {createPortal} from 'react-dom';
import {createDockview, DefaultTab, themeLight} from 'dockview';
import type {DockviewGroupPanel, GroupPanelPartInitParameters, IDockviewPanel, SerializedDockview} from 'dockview';
import {createSpriteLayoutMenu} from './sprite-layout-menu.ts';
import {NativeAssetPanel, SpriteAssetPane} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane';
import type {NativeAssetPanelRenderer, NativeAssetSelector, SpriteAssetKind, SpriteAssetLayout, SpriteAssetPreviewItem,
    SpriteVariable} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane';
import type {SpritePropertiesPanelProps} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-properties';
import {SpriteEditorToolbar, spriteEditorSections} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar';
import type {SpriteSearchResult} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-editor-toolbar';
import type {DockviewStagePane} from './dockview-stage.ts';
import {documentPanelTitle, getDocumentWorkspace} from './document-workspace.ts';
import type {DocumentPanelRequest} from './document-workspace.ts';
import {dockPopoutGroups, positionOnScreen, readWorkspaceLayout, workspaceWithoutTransientPanels}
    from './workspace-layout.ts';
import type {PanelReference, SavedPopout, WorkspaceLayout} from './workspace-layout.ts';
import {createWorkspaceLayoutStore} from './workspace-layout-store.ts';
import type {WorkspaceLayoutSession, WorkspaceLayoutStore, WorkspaceProjectIdentity} from './workspace-layout-store.ts';
import type {SpriteVariableEdit, SpriteVariableEditError} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';
import {SpriteMessagePane} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-message-pane';
import type {MessageRenameError} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-message-pane';
import type {MessageUse, ProjectMessage, TargetMessages} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import {createRenameMenuItem, spriteRenameLabel} from './target-tab-menu.ts';

export {getDocumentWorkspace} from './document-workspace.ts';
export {createWorkspaceLayoutStore, workspaceLayoutDatabase, workspaceLayoutLimit} from './workspace-layout-store.ts';
export type {WorkspaceLayoutStore, WorkspaceProjectIdentity} from './workspace-layout-store.ts';
export type {SpriteAssetKind, SpriteAssetPreviewItem} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-asset-pane';
export {editSpriteVariable} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';

export {useDockviewStage} from './dockview-stage.ts';
export {SpriteTargetTabsContext, useTargetTabMenu} from './target-tab-menu.ts';

interface CostumeAsset {
    encodeDataURI(): string;
}

interface Target {
    id: string;
    isOriginal: boolean;
    isStage: boolean;
    getName(): string;
    getCostumes?(): {assetId?: string}[];
    getCurrentCostume?(): {asset?: CostumeAsset} | undefined;
}

interface Project {
    editingTarget?: Target;
    runtime: {targets: Target[]};
    setEditingTarget(id: string): void;
    renameSprite?(id: string, name: string): void;
    on(event: 'targetsUpdate', listener: () => void): void;
    removeListener(event: 'targetsUpdate', listener: () => void): void;
}

export interface SpriteTabView {
    readonly id: string;
    readonly targetId: string;
    readonly isStage: boolean;
    readonly section: number;
    readonly groupId: string;
    readonly active: boolean;
    readonly groupActive: boolean;
}

export interface SpriteTabAdapter<Snapshot = unknown> {
    /** Read the state of the mounted surface; the host's selected target may have changed already. */
    capture(view: SpriteTabView): Snapshot;
    renderInactive(container: HTMLElement, view: SpriteTabView, snapshot: Snapshot | undefined): void | (() => void);
    restore(view: SpriteTabView, snapshot: Snapshot | undefined): void;
    dispose?(view: SpriteTabView, snapshot: Snapshot): void;
}

/** Optional bridge used by a native asset editor to restore and report its selection. */
export interface SpriteAssetSelection {
    restore(target: object, assets: readonly object[]): number | undefined;
    remember(target: object, asset: object | undefined, select?: (index: number) => void): void;
    renderPanel?(render: NativeAssetPanelRenderer, previewSelector: NativeAssetSelector,
        panel: React.ComponentProps<typeof NativeAssetPanel>['panel']): React.ReactNode;
    rememberLayout?(render: SpriteAssetLayout): void;
    getScrollTop?(): number;
    rememberScrollTop?(position: number): void;
}

type AssetKind = SpriteAssetKind;

const variableSection = spriteEditorSections.indexOf('variables');
const messageSection = spriteEditorSections.indexOf('messages');
// The first three sections are the GUI's own panels; the rest are rendered by this package.
const lastNativeSection = 2;

export interface SpriteAssetPreviewData {
    items: readonly SpriteAssetPreviewItem[];
    defaultAsset?: object;
}
type AssetSelections = Readonly<Record<AssetKind, SpriteAssetSelection>>;

function createAssetSelections(target: Target, locale: string, source?: {
    selected: Map<AssetKind, object>;
    layouts: Map<AssetKind, SpriteAssetLayout>;
    scroll: Map<AssetKind, number>;
}) {
    const selected = new Map(source?.selected);
    const layouts = new Map(source?.layouts);
    const scroll = new Map(source?.scroll);
    const selectors = new Map<AssetKind, (index: number) => void>();
    const forKind = (kind: AssetKind): SpriteAssetSelection => {
        const state = {
            rememberLayout(render: SpriteAssetLayout) {
                layouts.set(kind, render);
            },
            getScrollTop: () => scroll.get(kind) ?? 0,
            rememberScrollTop(position: number) {
                scroll.set(kind, position);
            }
        };
        return {
            ...state,
            renderPanel: (render, previewSelector, panel) =>
                React.createElement(NativeAssetPanel, {render, previewSelector, panel, kind, locale, state}),
            restore(current, assets) {
                if (current !== target) return;
                const index = assets.indexOf(selected.get(kind));
                if (index >= 0) return index;
            },
            remember(current, asset, select) {
                if (current !== target) return;
                if (asset) selected.set(kind, asset);
                else selected.delete(kind);
                if (select) selectors.set(kind, select);
            },
        };
    };
    const ports: AssetSelections = {costumes: forKind('costumes'), sounds: forKind('sounds')};
    return {selected, ports, layouts, selectors, scroll};
}

export type SpriteSplitDirection = 'right' | 'below';

const stagePanelId = 'tw-plus-stage-display';
const documentComponent = 'tw-plus-document';

interface TabOptions<Snapshot = unknown> {
    vm: Project;
    getSection(): number;
    activateSection(section: number): void;
    selectTarget(id: string, assetSelections?: AssetSelections): void;
    resize(): void;
    reopenLabel: string;
    multiView?: boolean;
    /** Keep the workspace of each project and reopen it with the project. */
    workspaceLayout?: {
        /** IndexedDB by default. */
        store?: WorkspaceLayoutStore;
        /** The file, folder or desktop key the loaded project came from. Without one, it is known by its name. */
        identify?(): WorkspaceProjectIdentity | undefined;
        isProjectLoading?(): boolean;
        subscribeProject?(listener: () => void): (() => void) | undefined;
    };
    stagePane?: DockviewStagePane;
    variables?: boolean;
    messages?: boolean;
    locale?: string;
    viewAdapter?: SpriteTabAdapter<Snapshot>;
    popouts?: {url: string; className?: string; openPalette?(view: SpriteTabView): void};
    park?(): void;
    renameLabels?: RenameLabels;
    onToolbarSlots?(slots: readonly ToolbarSlot[]): void;
    onAssetPreviewSlots?(slots: readonly AssetPreviewSlot[]): void;
}

interface ToolbarActions {
    activate(): void;
    setSection(section: number): void;
}

interface ToolbarSlot {
    view: SpriteTabView;
    element: HTMLElement;
}

interface AssetPreviewSlot {
    id: string;
    targetId: string;
    kind: AssetKind | 'variables' | 'messages';
    editable: boolean;
    selected?: object;
    renderLayout?: SpriteAssetLayout;
    scrollTop?: number;
    element: HTMLElement;
}

interface TabSlot {
    body: HTMLElement;
    toolbar?: HTMLElement;
    assetPreview?: HTMLElement;
    clearInactive?: () => void;
    inactiveSection?: number;
}

interface View<Snapshot> {
    id: string;
    target: Target;
    number?: number;
    section: number;
    assets: ReturnType<typeof createAssetSelections>;
    snapshots?: Map<number, {snapshot: Snapshot; view: SpriteTabView}>;
}

const renameLabels = {
    en: {title: spriteRenameLabel('en'), name: 'Sprite name', cancel: 'Cancel', save: 'Rename'},
    ja: {title: spriteRenameLabel('ja'), name: 'スプライト名', cancel: 'キャンセル', save: '変更'}
};
type RenameLabels = typeof renameLabels.en;
const targetName = (target: Target) => target.isStage ? 'Stage' : target.getName();
const projectSignature = (targets: readonly Target[]) => JSON.stringify(targets
    .map(target => JSON.stringify([target.isStage, targetName(target), target.getCostumes?.()[0]?.assetId ?? '']))
    .sort());

class SpriteTab extends DefaultTab {
    private readonly icon: HTMLImageElement;

    constructor(document: Document) {
        super();
        this.icon = document.createElement('img');
        this.icon.className = 'tw-plus-sprite-tab-icon';
        this.icon.alt = '';
        this.icon.draggable = false;
        this.element.prepend(this.icon);
    }

    init(options: GroupPanelPartInitParameters) {
        super.init(options);
        this.update(options);
    }

    update({params}: {params: {icon?: string}}) {
        this.icon.hidden = !params.icon;
        if (params.icon) this.icon.src = params.icon;
        else this.icon.removeAttribute('src');
    }
}

export function mountSpriteTabs<Snapshot>(root: HTMLElement, content: HTMLElement, options: TabOptions<Snapshot>) {
    const {vm, multiView = false, locale = 'en'} = options;
    const viewAdapter = multiView ? options.viewAdapter : undefined;
    const stagePane = multiView ? options.stagePane : undefined;
    const ownSection = (section: number) => (section === variableSection && Boolean(options.variables)) ||
        (section === messageSection && Boolean(options.messages));
    const usesNativeSection = (section: number) => !ownSection(section);
    const sectionAvailable = (section: number) => section <= lastNativeSection || ownSection(section);
    const document = root.ownerDocument;
    const japanese = /^ja(?:-|$)/i.test(locale);
    const editLabel = japanese ? 'クリックしてこのビューで編集' : 'Activate this view to edit';
    const backdropTitle = japanese ? '背景' : 'Backdrops';
    const baseTitle = (target: Target) => target.isStage ? backdropTitle : target.getName();
    const numberedTitle = (target: Target, number: number) => `${baseTitle(target)}(${number})`;
    const tabTitle = ({target, number}: View<Snapshot>) => number ? numberedTitle(target, number) : baseTitle(target);
    const chipText = japanese ?
        {collapse: 'グループを折りたたむ', expand: 'グループを展開する', close: 'このグループのタブを閉じる', closeAll: 'この分割パネルの文書タブをすべて閉じる'} :
        {collapse: 'Collapse group', expand: 'Expand group', close: 'Close the tabs of this group', closeAll: 'Close all document tabs of this split'};
    const slots = new Map<string, TabSlot>();
    const views = new Map<string, View<Snapshot>>();
    const documents = new Map<string, {request: DocumentPanelRequest; session?: ReturnType<DocumentPanelRequest['mount']>}>();
    const costumeIcons = new WeakMap<CostumeAsset, string>();
    const remembered = new WeakMap<Target, number>();
    const lastUsed = new WeakMap<Target, View<Snapshot>>();
    let closed = new WeakSet<Target>();
    let active: View<Snapshot> | undefined;
    let observed = vm.editingTarget;
    let syncing = false;
    let nextView = 0;
    let renameDialog: HTMLDialogElement | undefined;
    const text = options.renameLabels ?? renameLabels.en;
    const persistence = multiView && options.workspaceLayout;
    const layoutStore = persistence ? persistence.store ?? createWorkspaceLayoutStore() : undefined;
    /** Where the layout of the loaded project is saved, once that project is identified. */
    let layoutSession: WorkspaceLayoutSession | undefined;
    /** Counts project loads, so a lookup that ends after another project opened is dropped. */
    let projectGeneration = 0;
    let openingGeneration: number | undefined;
    let projectLoading = false;
    /** The shape of the layout the project opened with, which is not worth a record of its own. */
    let initialShape: string | undefined;
    let disposed = false;
    const window = document.defaultView;
    const documentWorkspace = multiView && getDocumentWorkspace(vm);
    let pendingRestore = Boolean(persistence);
    let restoreFrame: number | undefined;
    let restoreTimeout: number | undefined;
    let saveFrame: number | undefined;
    const openingGroups = new Set<string>();
    /** Panels that were in a separate window when the layout was saved, until the user reopens them. */
    const reopenable = new Map<string, SavedPopout>();
    const originalTargets = () => vm.runtime.targets.filter(target => target.isOriginal);
    // Whether tabs stand in a column at the left of each split. It is the user's preference for every project.
    let verticalTabs = false;
    let tabsChosen = false;

    const dockview = createDockview(root, {
        theme: themeLight,
        disableFloatingGroups: true,
        defaultHeaderPosition: verticalTabs ? 'left' : 'top',
        ...(multiView && {createRightHeaderActionComponent: createLayoutMenu}),
        defaultTabComponent: 'sprite',
        createTabComponent: () => new SpriteTab(document),
        // A chip stands for several tabs, such as the changed scripts of one sprite, so it closes them together.
        getTabGroupChipContextMenuItems: ({tabGroup, group}) => [
            {label: tabGroup.collapsed ? chipText.expand : chipText.collapse, action: () => tabGroup.toggle()},
            {label: chipText.close, action: () => {
                for (const id of [...tabGroup.panelIds]) dockview.getPanel(id)?.api.close();
            }},
            {label: chipText.closeAll, action: () => {
                for (const panel of [...group.panels]) if (documents.has(panel.id)) panel.api.close();
            }}
        ],
        getTabContextMenuItems: ({panel}) => {
            const view = views.get(panel.id);
            if (!view) return [];
            const items = [];
            if (multiView) items.push({
                label: japanese ? '新しいタブで開く' : 'Open in new tab',
                action: () => openInNewTab(view.id)
            });
            if (!view.target.isStage && vm.renameSprite) items.push({
                component: 'rename-sprite'
            });
            return items;
        },
        createContextMenuItemComponent: ({component}) => component === 'rename-sprite' ?
            createRenameMenuItem(document, text.title, id => {
                const target = views.get(id)?.target;
                if (target) openRenameDialog(target);
            }) : undefined,
        createComponent: ({name, id: componentId}) => {
            const element = document.createElement('div');
            if (name === documentComponent) {
                element.className = 'tw-plus-document-slot';
                return {element, init({api}) {
                    const item = documents.get(componentId);
                    element.dataset.providerId = item.request.reference.providerId;
                    element.dataset.documentId = item.request.reference.documentId;
                    item.session = item.request.mount(element, () => api.close());
                }};
            }
            if (name === stagePanelId) {
                element.className = 'tw-plus-dockview-stage-slot';
                return {element, init() { stagePane.attach(element); }};
            }
            element.className = 'tw-plus-sprite-tab-slot';
            const body = multiView ? document.createElement('div') : element;
            const toolbar = multiView && options.onToolbarSlots ? document.createElement('div') : undefined;
            const assetPreview = multiView && options.onAssetPreviewSlots ? document.createElement('div') : undefined;
            let id: string;
            let dimensions: {dispose(): void} | undefined;
            if (multiView) {
                element.classList.add('tw-plus-sprite-tab-slot--split');
                body.className = 'tw-plus-sprite-tab-body';
                if (toolbar) {
                    body.setAttribute('role', 'tabpanel');
                    toolbar.className = 'tw-plus-sprite-tab-toolbar';
                    element.append(toolbar);
                }
                if (assetPreview) {
                    assetPreview.className = 'tw-plus-sprite-tab-asset-preview';
                    assetPreview.hidden = true;
                    assetPreview.tabIndex = 0;
                    assetPreview.setAttribute('role', 'group');
                    assetPreview.setAttribute('aria-label', editLabel);
                    assetPreview.addEventListener('keydown', event => {
                        if (event.target !== assetPreview || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        event.stopPropagation();
                        activateView(id);
                    });
                    body.append(assetPreview);
                }
                element.append(body);
                body.addEventListener('click', event => {
                    if (active?.id === id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    activateView(id);
                }, {capture: true});
            }
            const slot: TabSlot = {body, toolbar, assetPreview};
            return {
                element,
                init(params) {
                    id = params.api.id;
                    slots.set(id, slot);
                    if (toolbar) body.id = id + '-content';
                    if (multiView) {
                        dimensions = params.api.onDidDimensionsChange(() => {
                            if (active?.id === id && body.contains(content)) options.resize();
                        });
                    }
                },
                dispose() {
                    dimensions?.dispose();
                    clearInactive(slot);
                    if (slots.get(id) === slot) slots.delete(id);
                }
            };
        },
        createWatermarkComponent: () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = options.reopenLabel;
            button.addEventListener('click', () => {
                if (vm.editingTarget) select(vm.editingTarget.id);
            });
            return {element: button, init() {}};
        }
    });
    const preventSplit = (event: {kind: string; position: string; preventDefault(): void}) => {
        if (event.kind === 'edge' || event.kind === 'content' && event.position !== 'center') event.preventDefault();
    };
    const overlay = !multiView && dockview.onWillShowOverlay(preventSplit);
    const drop = dockview.onWillDrop(event => {
        if (!multiView) {
            preventSplit(event);
            return;
        }
        if (event.group?.api.location.type !== 'popout') return;
        const transfer = event.getData();
        const ids = transfer?.panelId ? [transfer.panelId] :
            dockview.groups.find(group => group.id === transfer?.groupId)?.panels.map(panel => panel.id) ?? [];
        if (ids.some(id => documents.has(id))) event.preventDefault();
    });

    function createLayoutMenu(group: DockviewGroupPanel) {
        const popouts = options.popouts;
        const canOpenPanel = () => group.api.location.type === 'grid' &&
            !openingGroups.has(group.id) && views.has(group.activePanel?.id);
        const codeView = () => {
            const view = views.get(group.activePanel?.id);
            return view?.section === 0 ? view : undefined;
        };
        const menu = createSpriteLayoutMenu(document, locale, {
            splitRight: () => { if (group.activePanel) split('right', group.activePanel.id); },
            splitBelow: () => { if (group.activePanel) split('below', group.activePanel.id); },
            close: () => { if (group.activePanel) closeSplit(group.activePanel.id); },
            canClose: () => canCloseGroup(group),
            canSplit: () => views.has(group.activePanel?.id),
            verticalTabs: () => verticalTabs,
            setVerticalTabs,
            ...(popouts && {
                canOpenPanel,
                openPanel() {
                    const panel = group.activePanel;
                    if (!panel || !canOpenPanel()) return;
                    openingGroups.add(group.id);
                    const saved = reopenable.get(panel.id)?.position;
                    void dockview.addPopoutGroup(panel, {
                        popoutUrl: popouts.url,
                        ...(saved && {position: positionOnScreen(saved, window.screen)}),
                        onDidOpen({window: child}) {
                            child.addEventListener('load', () => {
                                const doc = child.document;
                                doc.title = panel.title;
                                doc.documentElement.dir = document.documentElement.dir;
                                doc.documentElement.lang = document.documentElement.lang;
                                doc.documentElement.style.cssText = document.documentElement.style.cssText;
                                doc.body.className = `${document.body.className} ${popouts.className ?? ''}`;
                            }, {once: true});
                        }
                    })
                        .then(opened => { if (opened) reopenable.delete(panel.id); })
                        .finally(() => openingGroups.delete(group.id));
                },
                canOpenPalette: () => Boolean(codeView()),
                openPalette: popouts.openPalette && (() => {
                    const view = codeView();
                    if (view && activateView(view.id)) popouts.openPalette(describe(view));
                })
            })
        });
        return {...menu, init() {}};
    }

    function setVerticalTabs(vertical: boolean, chosen = true) {
        verticalTabs = vertical;
        const position = vertical ? 'left' : 'top';
        dockview.updateOptions({defaultHeaderPosition: position});
        for (const group of dockview.groups) group.api.setHeaderPosition(position);
        if (chosen) {
            tabsChosen = true;
            layoutStore?.writeTabsPosition(position).catch(() => undefined);
        }
        refreshSurfaces();
    }

    const canRename = (target: Target) =>
        target.isOriginal && !target.isStage && Boolean(vm.renameSprite) && vm.runtime.targets.includes(target);

    function openRenameDialog(target: Target) {
        if (renameDialog || !canRename(target)) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'tw-plus-sprite-rename';
        dialog.setAttribute('aria-label', text.title);
        const form = document.createElement('form');
        form.method = 'dialog';
        const title = document.createElement('strong');
        title.textContent = text.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('aria-label', text.name);
        input.value = target.getName();
        const save = document.createElement('button');
        save.value = 'save';
        save.textContent = text.save;
        const cancel = document.createElement('button');
        cancel.value = 'cancel';
        cancel.textContent = text.cancel;
        const actions = document.createElement('div');
        actions.append(save, cancel);
        form.append(title, input, actions);
        dialog.append(form);
        dialog.addEventListener('close', () => {
            dialog.remove();
            if (renameDialog !== dialog) return;
            renameDialog = undefined;
            if (dialog.returnValue === 'save' && input.value.trim() && canRename(target) &&
                input.value !== target.getName()) vm.renameSprite?.(target.id, input.value);
        }, {once: true});
        renameDialog = dialog;
        root.append(dialog);
        dialog.showModal();
        input.select();
    }

    function getIcon(target: Target) {
        const asset = target.getCurrentCostume?.()?.asset;
        if (!asset) return '';
        if (!costumeIcons.has(asset)) costumeIcons.set(asset, asset.encodeDataURI());
        return costumeIcons.get(asset);
    }

    function describe(view: View<Snapshot>, panel = dockview.getPanel(view.id)): SpriteTabView {
        return {
            id: view.id, targetId: view.target.id, isStage: view.target.isStage,
            section: view.section, groupId: panel?.api.group.id ?? '',
            active: active === view, groupActive: panel?.api.isGroupActive ?? false
        };
    }

    function clearInactive(slot: TabSlot) {
        if (slot.assetPreview) slot.assetPreview.hidden = true;
        if (slot.inactiveSection === undefined) return;
        slot.clearInactive?.();
        slot.clearInactive = undefined;
        slot.inactiveSection = undefined;
        // Keep the React portal host mounted while its children reconcile.
        slot.body.replaceChildren(...(slot.assetPreview ? [slot.assetPreview] : []));
    }

    function refreshSurfaces() {
        if (!multiView) return;
        const toolbars: ToolbarSlot[] = [];
        const assetPreviews: AssetPreviewSlot[] = [];
        for (const [id, slot] of slots) {
            const view = views.get(id);
            const panel = dockview.getPanel(id);
            if (!view || !panel || panel.api.group.activePanel !== panel) {
                clearInactive(slot);
                continue;
            }
            const descriptor = describe(view, panel);
            if (slot.toolbar) {
                toolbars.push({view: descriptor, element: slot.toolbar});
                slot.body.setAttribute('aria-labelledby', id + '-section-' + (spriteEditorSections[view.section] ?? 'code'));
            }
            if (ownSection(view.section) && slot.assetPreview) {
                slot.assetPreview.hidden = false;
                assetPreviews.push({id, targetId: descriptor.targetId,
                    kind: view.section === messageSection ? 'messages' : 'variables', editable: active === view,
                    element: slot.assetPreview});
                continue;
            }
            if (active === view) {
                // The active view shows its native editor here; a variables or messages pane left
                // visible from the previous section would sit above it and push it out of view.
                if (slot.assetPreview) slot.assetPreview.hidden = true;
                continue;
            }
            const kind = view.section === 1 ? 'costumes' : view.section === 2 ? 'sounds' : undefined;
            if (kind && slot.assetPreview) {
                clearInactive(slot);
                slot.assetPreview.hidden = false;
                assetPreviews.push({id, targetId: descriptor.targetId, kind, element: slot.assetPreview,
                    selected: view.assets.selected.get(kind), editable: false, renderLayout: view.assets.layouts.get(kind), scrollTop: view.assets.scroll.get(kind)});
                continue;
            }
            if (slot.inactiveSection === view.section) continue;
            clearInactive(slot);
            slot.inactiveSection = view.section;
            if (viewAdapter) {
                const cleanup = viewAdapter.renderInactive(slot.body, descriptor, view.snapshots?.get(view.section)?.snapshot);
                if (cleanup) slot.clearInactive = cleanup;
            } else {
                const button = slot.body.ownerDocument.createElement('button');
                button.type = 'button';
                button.textContent = editLabel;
                slot.body.append(button);
            }
        }
        options.onToolbarSlots?.(toolbars);
        options.onAssetPreviewSlots?.(assetPreviews);
    }

    function remember(view: View<Snapshot>) {
        if (usesNativeSection(view.section)) view.section = options.getSection();
        remembered.set(view.target, view.section);
        if (!viewAdapter || !usesNativeSection(view.section) || !slots.get(view.id)?.body.contains(content)) return;
        const descriptor = describe(view);
        const snapshot = viewAdapter.capture(descriptor);
        view.snapshots ??= new Map();
        const previous = view.snapshots.get(view.section);
        if (previous && snapshot !== previous.snapshot) viewAdapter.dispose?.(previous.view, previous.snapshot);
        view.snapshots.set(view.section, {snapshot, view: descriptor});
    }

    function show(panel: IDockviewPanel | undefined) {
        if (panel?.id === stagePanelId || documents.has(panel?.id)) {
            // Utility panels do not change the VM editing target.
            refreshSurfaces();
            return;
        }
        const next = views.get(panel?.id);
        if (active === next) {
            refreshSurfaces();
            return;
        }
        if (active && views.get(active.id) === active) remember(active);
        active = next;
        if (!next) {
            if (options.park) options.park();
            else content.remove();
            options.selectTarget('');
        } else {
            if (!multiView) next.section = remembered.get(next.target) ?? options.getSection();
            const slot = slots.get(next.id);
            clearInactive(slot);
            slot.body.appendChild(content);
            if (vm.editingTarget !== next.target) vm.setEditingTarget(next.target.id);
            observed = vm.editingTarget;
            options.selectTarget(next.target.id, multiView ? next.assets.ports : undefined);
            content.hidden = !usesNativeSection(next.section);
            if (usesNativeSection(next.section)) options.activateSection(next.section);
            viewAdapter?.restore(describe(next, panel), next.snapshots?.get(next.section)?.snapshot);
            options.resize();
        }
        refreshSurfaces();
    }

    function nextTabNumber(target: Target, titles: ReadonlySet<string>) {
        let number = 2;
        while (titles.has(numberedTitle(target, number))) number++;
        return number;
    }

    function reservedTitles() {
        return new Set([...originalTargets().map(baseTitle),
            ...dockview.panels.filter(panel => !views.has(panel.id)).map(panel => panel.title)]);
    }

    function assignTabNumbers(items: Iterable<View<Snapshot>>, titles = reservedTitles()) {
        const originals = new Set<Target>();
        for (const view of items) {
            if (!view.number && !originals.has(view.target)) {
                originals.add(view.target);
                continue;
            }
            if (!view.number || titles.has(tabTitle(view))) view.number = nextTabNumber(view.target, titles);
            titles.add(tabTitle(view));
        }
    }

    function add(target: Target, position?: {referencePanel: string; direction: SpriteSplitDirection | 'within'}, section?: number) {
        let id = target.id;
        if (position || views.has(id) || id === stagePanelId || documents.has(id)) {
            do {
                id = 'sprite-view-' + ++nextView;
            } while (views.has(id) || documents.has(id) || vm.runtime.targets.some(item => item.id === id));
        }
        const source = position && views.get(position.referencePanel);
        // An inactive panel leaves dockview without an active group, and dockview then opens each later
        // panel in a new group; keep sprites added without a split as tabs of an existing sprite group.
        const spriteGroup = !position && !dockview.activeGroup &&
            dockview.groups.find(group => group.panels.some(panel => views.has(panel.id)));
        const view = {id, target, section: section ?? remembered.get(target) ?? options.getSection(),
            number: source && nextTabNumber(target, new Set([...reservedTitles(), ...[...views.values()].map(tabTitle)])),
            assets: createAssetSelections(target, locale, source?.assets)};
        views.set(id, view);
        try {
            return dockview.addPanel({id, title: tabTitle(view), component: 'sprite', inactive: !position,
                position: position ?? (spriteGroup ? {referenceGroup: spriteGroup} : undefined),
                params: {icon: getIcon(target)}});
        } catch (error) {
            views.delete(id);
            throw error;
        }
    }

    function activateView(id: string) {
        const view = views.get(id);
        if (!view) return false;
        lastUsed.set(view.target, view);
        dockview.getPanel(id)?.api.setActive();
        return true;
    }

    function select(id: string) {
        const target = vm.runtime.targets.find(item => item.id === id && item.isOriginal);
        if (!target) return;
        closed.delete(target);
        if (active?.target === target && views.get(active.id) === active) {
            activateView(active.id);
            return;
        }
        const recent = lastUsed.get(target);
        const view = recent && views.get(recent.id) === recent ? recent :
            [...views.values()].find(item => item.target === target);
        activateView(view?.id ?? add(target).id);
    }

    function targetTabs(id?: string) {
        return dockview.groups.map(group => ({group, rect: group.element.getBoundingClientRect()}))
            .sort((a, b) => Number(a.group.api.location.type !== 'grid') - Number(b.group.api.location.type !== 'grid') ||
                a.rect.left - b.rect.left || a.rect.top - b.rect.top)
            .flatMap(({group}) => group.panels.flatMap(panel => {
                const target = views.get(panel.id)?.target;
                return target && (id === undefined ? target.isStage : target.id === id) ?
                    [{id: panel.id, title: panel.title}] : [];
            }));
    }

    function selectFromList(id?: string) {
        const first = targetTabs(id)[0];
        if (first) activateView(first.id);
        else {
            const target = originalTargets().find(item => id === undefined ? item.isStage : item.id === id);
            if (target) select(target.id);
        }
    }

    function openDocument(request: DocumentPanelRequest) {
        if (pendingRestore) finishRestore();
        const {providerId, documentId} = request.reference;
        for (const [id, {request: opened}] of documents) {
            if (opened.reference.providerId === providerId && opened.reference.documentId === documentId) {
                if (!request.inactive) dockview.getPanel(id)?.api.setActive();
                return;
            }
        }
        let id: string;
        do {
            id = 'document-view-' + ++nextView;
        } while (views.has(id) || documents.has(id) || vm.runtime.targets.some(target => target.id === id));
        const title = documentPanelTitle(request);
        const position = documentPosition(request);
        documents.set(id, {request});
        try {
            dockview.addPanel({id, title, component: documentComponent, renderer: 'always',
                inactive: request.inactive, ...(position && {position})});
        } catch (error) {
            documents.get(id)?.session?.dispose();
            documents.delete(id);
            throw error;
        }
        if (request.tabGroup) joinTabGroup(id, request.tabGroup);
    }

    /** Where a document of an area opens: in the split that already shows its area, or in a new split beside the editor. */
    function documentPosition({area}: DocumentPanelRequest) {
        if (!area) return;
        for (const [id, {request}] of documents) {
            const panel = request.area === area && dockview.getPanel(id);
            if (panel && panel.group.api.location.type === 'grid') return {referenceGroup: panel.group};
        }
        const reference = dockview.activePanel;
        return reference && reference.group.api.location.type === 'grid' ?
            {referencePanel: reference.id, direction: 'right' as const} : undefined;
    }

    function joinTabGroup(id: string, {id: key, label, color, collapsed}: NonNullable<DocumentPanelRequest['tabGroup']>) {
        const panel = dockview.getPanel(id);
        if (!panel) return;
        const groupId = panel.group.id;
        const existing = dockview.getTabGroups({groupId}).find(item => item.componentParams?.key === key);
        const tabGroup = existing ?? dockview.createTabGroup({groupId, label, color, componentParams: {key}});
        dockview.addPanelToTabGroup({groupId, tabGroupId: tabGroup.id, panelId: id});
        if (!existing && collapsed) tabGroup.collapse();
    }

    function guardDocumentClose(event: MouseEvent | KeyboardEvent) {
        const element = event.target as HTMLElement;
        const tab = element.closest<HTMLElement>('[data-tab-panel-id]');
        const item = documents.get(tab?.dataset.tabPanelId);
        if (!item) return;
        const close = event.type === 'click' ? Boolean(element.closest('.dv-default-tab-action')) :
            event.target === tab && ['Delete', 'Backspace'].includes((event as KeyboardEvent).key);
        if (!close) return;
        event.preventDefault();
        event.stopPropagation();
        item.session?.requestClose();
    }

    function canCloseGroup(group: DockviewGroupPanel) {
        return dockview.groups.length > 1 && group.panels.every(panel => !documents.has(panel.id));
    }

    function openStage() {
        if (!stagePane) return;
        if (pendingRestore) finishRestore();
        const existing = dockview.getPanel(stagePanelId);
        if (existing) {
            existing.api.setActive();
            return;
        }
        const reference = dockview.activePanel;
        dockview.addPanel({id: stagePanelId, title: stagePane.title, component: stagePanelId, renderer: 'always',
            position: reference ? {referencePanel: reference.id, direction: 'right'} : undefined});
    }

    function closeStage() {
        dockview.getPanel(stagePanelId)?.api.close();
    }

    function addView(direction: SpriteSplitDirection | 'within', id = active?.id) {
        const reference = views.get(id);
        if (!multiView || !reference) return;
        const section = reference === active && usesNativeSection(reference.section) ? options.getSection() : reference.section;
        const panel = add(reference.target, {referencePanel: id, direction}, section);
        activateView(panel.id);
        return panel.id;
    }

    const split = (direction: SpriteSplitDirection, id?: string) => addView(direction, id);
    const openInNewTab = (id: string) => addView('within', id);

    function closeSplit(id = active?.id) {
        const panel = dockview.getPanel(id);
        if (!multiView || !panel || !canCloseGroup(panel.api.group)) return false;
        syncing = true;
        try {
            dockview.removeGroup(panel.api.group);
            show(dockview.activePanel);
        } finally {
            syncing = false;
        }
        return true;
    }

    function setViewSection(id: string, section: number) {
        const view = views.get(id);
        if (!view || !Number.isInteger(section) || section < 0 || !sectionAvailable(section) ||
            view.section === section) return false;
        if (view === active && viewAdapter) remember(view);
        view.section = section;
        if (view === active) {
            content.hidden = !usesNativeSection(section);
            if (usesNativeSection(section)) {
                options.activateSection(section);
                options.resize();
            }
            viewAdapter?.restore(describe(view), view.snapshots?.get(section)?.snapshot);
        }
        refreshSurfaces();
        scheduleSave();
        return true;
    }

    function syncActiveSection(section: number) {
        if (!active || !usesNativeSection(active.section) || active.section === section) return;
        active.section = section;
        refreshSurfaces();
        scheduleSave();
    }

    /** The current workspace as it is saved, or nothing while it cannot be described yet. */
    function captureLayout(): WorkspaceLayout | undefined {
        const targets = originalTargets();
        if (!targets.length) return;
        const serialized = dockview.toJSON();
        if (serialized.grid.width <= 0 || serialized.grid.height <= 0) return;
        const docked = dockPopoutGroups(serialized.grid, serialized.activeGroup, serialized.popoutGroups);
        if (!docked) return;
        const panels: Record<string, PanelReference> = Object.create(null);
        for (const [id, view] of views) {
            panels[id] = {kind: 'sprite', name: targetName(view.target), stage: view.target.isStage, section: view.section,
                number: view.number};
        }
        if (dockview.getPanel(stagePanelId)) panels[stagePanelId] = {kind: 'stage'};
        const transient = new Set<string>();
        for (const [id, {request}] of documents) {
            if (request.transient) transient.add(id);
            else panels[id] = {kind: 'document', ...request.reference};
        }
        const saved = workspaceWithoutTransientPanels(docked.grid, docked.activeGroup, transient, active?.id);
        if (!saved) return;
        // A window can close before the last save, for example when the page unloads, so each window is kept
        // with its last position until the user opens that panel in a window again.
        for (const popout of docked.popouts) for (const id of popout.panels) reopenable.set(id, popout);
        const popouts = [...new Set(reopenable.values())]
            .map(popout => ({...popout, panels: popout.panels.filter(id =>
                reopenable.get(id) === popout && views.has(id) && panels[id]?.kind === 'sprite')}))
            .filter(popout => popout.panels.length);
        return {version: 1, project: projectSignature(targets), ...saved,
            editingView: active?.id, panels, ...(popouts.length && {popouts})};
    }

    function writeLayout() {
        saveFrame = undefined;
        if (!persistence || !layoutSession || pendingRestore || syncing || persistence.isProjectLoading?.()) return;
        const snapshot = captureLayout();
        if (!snapshot) return;
        // Opening a project and leaving its tabs as they were is not worth a record that pushes out another project.
        if (!layoutSession.saved && initialShape !== undefined && layoutShape(snapshot) === initialShape) return;
        layoutSession.write(JSON.stringify(snapshot), snapshot.project).catch(() => undefined);
    }

    function scheduleSave() {
        if (persistence && layoutSession && !pendingRestore && saveFrame === undefined) {
            saveFrame = window.requestAnimationFrame(writeLayout);
        }
    }

    function flushLayout() {
        const pending = saveFrame !== undefined;
        if (pending) window.cancelAnimationFrame(saveFrame!);
        // Moving or resizing a separate window does not change the docked layout, so record it on the way out.
        if (pending || dockview.groups.some(group => group.api.location.type === 'popout')) writeLayout();
    }

    function finishRestore() {
        pendingRestore = false;
        window.clearTimeout(restoreTimeout);
        restoreTimeout = undefined;
    }

    /** The panels and splits of a layout, without sizes or selection, to tell whether the user changed it. */
    function layoutShape(layout: WorkspaceLayout) {
        type Node = WorkspaceLayout['grid']['root'];
        const reference = (id: string) => layout.panels[id] ?? null;
        const shape = (node: Node): unknown => Array.isArray(node.data) ? node.data.map(shape) :
            node.data.views.map(reference);
        return JSON.stringify([layout.grid.orientation, shape(layout.grid.root),
            (layout.popouts ?? []).map(popout => popout.panels.map(reference))]);
    }

    function identifyProject(): WorkspaceProjectIdentity {
        try {
            const identity = persistence && persistence.identify?.();
            if (identity) return identity;
        } catch { /* The project is still known by its name and sprites. */ }
        return {kind: 'anonymous', name: ''};
    }

    /** Find where the loaded project keeps its layout. It runs once for each project load. */
    function openLayoutSession(signature: string) {
        if (!layoutStore || openingGeneration === projectGeneration) return;
        const generation = openingGeneration = projectGeneration;
        layoutStore.open(identifyProject(), signature).then(session => {
            if (disposed || generation !== projectGeneration) return;
            layoutSession = session;
            scheduleRestore();
        }, () => {
            // Without IndexedDB, the project opens with the default layout and nothing is saved.
            if (!disposed && generation === projectGeneration) finishRestore();
        });
    }

    /** Keep the layout the project opened with, so leaving it unchanged adds no record. */
    function keepInitialLayout() {
        const layout = captureLayout();
        initialShape = layout && layoutShape(layout);
        finishRestore();
    }

    function restoreLayout() {
        restoreFrame = undefined;
        if (!persistence || persistence.isProjectLoading?.()) return;
        const targets = originalTargets();
        if (!targets.length || !vm.editingTarget) return;
        const signature = projectSignature(targets);
        if (!layoutSession) return openLayoutSession(signature);
        if (!pendingRestore) return;
        reopenable.clear();
        // A project found by its file, folder or desktop key keeps its tabs even after its sprites were renamed.
        const exact = layoutSession.exact;
        const raw = layoutSession.layout;
        const stored = raw ? readWorkspaceLayout(raw, exact ? undefined : signature) : undefined;
        if (!stored) return keepInitialLayout();
        const resolvedSprites = new Map<string, View<Snapshot>>();
        const resolvedDocuments = new Map<string, DocumentPanelRequest>();
        const panels: SerializedDockview['panels'] = Object.create(null);
        const dropped = new Set<string>();
        for (const [id, reference] of Object.entries(stored.panels)) {
            if (reference.kind === 'sprite') {
                const target = targets.find(item => item.isStage === reference.stage && targetName(item) === reference.name);
                if (id === stagePanelId) return keepInitialLayout();
                if (!target || !sectionAvailable(reference.section)) {
                    if (!exact) return keepInitialLayout();
                    dropped.add(id);
                    continue;
                }
                resolvedSprites.set(id, {id, target, section: reference.section, number: reference.number,
                    assets: createAssetSelections(target, locale)});
                panels[id] = {id, contentComponent: 'sprite', params: {icon: getIcon(target)}};
            } else if (reference.kind === 'stage') {
                if (id !== stagePanelId) return keepInitialLayout();
                if (!stagePane) {
                    if (!exact) return keepInitialLayout();
                    dropped.add(id);
                    continue;
                }
                panels[id] = {id, title: stagePane.title, contentComponent: stagePanelId, renderer: 'always'};
            } else {
                if (id === stagePanelId) return keepInitialLayout();
                const request = documentWorkspace && documentWorkspace.resolve(reference);
                if (!request) {
                    // The project can finish loading before the Blockly host publishes its document catalog.
                    restoreTimeout ??= window.setTimeout(keepInitialLayout, 2000);
                    return;
                }
                resolvedDocuments.set(id, request);
                panels[id] = {id, title: documentPanelTitle(request), contentComponent: documentComponent, renderer: 'always'};
            }
        }
        const kept = workspaceWithoutTransientPanels(stored.grid, stored.activeGroup, dropped, stored.editingView);
        if (!kept) return keepInitialLayout();
        const editingView = stored.editingView && !dropped.has(stored.editingView) ? stored.editingView : undefined;
        assignTabNumbers(resolvedSprites.values(), new Set([...targets.map(baseTitle),
            ...Object.values(panels).map(panel => panel.title)]));
        for (const [id, view] of resolvedSprites) panels[id].title = tabTitle(view);
        finishRestore();
        syncing = true;
        try {
            dockview.clear();
            active = undefined;
            const represented = new Set([...resolvedSprites.values()].map(view => view.target));
            closed = new WeakSet(targets.filter(target => !represented.has(target)));
            for (const [id, view] of resolvedSprites) views.set(id, view);
            for (const [id, request] of resolvedDocuments) documents.set(id, {request});
            dockview.fromJSON({grid: kept.grid, activeGroup: kept.activeGroup, panels});
            for (const popout of stored.popouts ?? []) {
                for (const id of popout.panels) if (views.has(id)) reopenable.set(id, popout);
            }
            const selected = dockview.activePanel;
            show(views.has(selected?.id) ? selected : (editingView && dockview.getPanel(editingView)) ?? selected);
        } catch {
            dockview.clear();
            for (const view of views.values()) disposeView(view);
            for (const item of documents.values()) item.session?.dispose();
            documents.clear();
            closed = new WeakSet();
            active = undefined;
        } finally {
            syncing = false;
        }
        refresh();
    }

    function scheduleRestore() {
        if (persistence && (pendingRestore || !layoutSession) && restoreFrame === undefined) {
            restoreFrame = window.requestAnimationFrame(restoreLayout);
        }
    }

    /** Each loaded project has its own layout, so a new load reopens the tabs that project was left with. */
    function projectChanged() {
        const loading = Boolean(persistence && persistence.isProjectLoading?.());
        if (loading && !projectLoading) {
            projectGeneration++;
            layoutSession = undefined;
            initialShape = undefined;
            pendingRestore = true;
            if (saveFrame !== undefined) window.cancelAnimationFrame(saveFrame);
            saveFrame = undefined;
            window.clearTimeout(restoreTimeout);
            restoreTimeout = undefined;
        }
        projectLoading = loading;
        scheduleRestore();
    }

    function refresh() {
        if (syncing) return;
        syncing = true;
        try {
            const available = new Set(vm.runtime.targets.filter(target => target.isOriginal));
            const editing = vm.editingTarget;
            for (const [id, view] of views) {
                if (!available.has(view.target)) dockview.getPanel(id)?.api.close();
            }
            const represented = new Set<Target>();
            assignTabNumbers(views.values());
            for (const [id, view] of views) {
                represented.add(view.target);
                const panel = dockview.getPanel(id);
                const title = tabTitle(view);
                if (panel && panel.title !== title) panel.api.setTitle(title);
                const icon = getIcon(view.target);
                if (panel && panel.api.getParameters().icon !== icon) panel.api.updateParameters({icon});
            }
            for (const target of available) {
                if (!represented.has(target) && (!target.isStage || target === editing) && !closed.has(target)) {
                    add(target);
                }
            }
            if (editing && (observed !== editing || !active && !closed.has(editing))) {
                observed = editing;
                select(editing.id);
            }
            show(dockview.activePanel);
        } finally {
            syncing = false;
        }
        scheduleRestore();
    }

    function disposeView(view: View<Snapshot>) {
        for (const stored of view.snapshots?.values() ?? []) viewAdapter?.dispose?.(stored.view, stored.snapshot);
        const slot = slots.get(view.id);
        if (slot) clearInactive(slot);
        slots.delete(view.id);
        views.delete(view.id);
    }

    const selection = dockview.onDidActivePanelChange(({panel}) => {
        if (syncing) return;
        syncing = true;
        try {
            show(panel);
        } finally {
            syncing = false;
        }
        scheduleSave();
    });
    const removal = dockview.onDidRemovePanel(panel => {
        const item = documents.get(panel.id);
        if (item) {
            documents.delete(panel.id);
            item.session?.dispose();
            return;
        }
        if (panel.id === stagePanelId) {
            stagePane?.attach(null);
            return;
        }
        const view = views.get(panel.id);
        if (!view) return;
        if (view === active) remembered.set(view.target, usesNativeSection(view.section) ? options.getSection() : view.section);
        disposeView(view);
        if (![...views.values()].some(item => item.target === view.target)) closed.add(view.target);
    });
    const layout = multiView && dockview.onDidLayoutChange(() => {
        refreshSurfaces();
        scheduleSave();
    });
    const disconnectDocuments = documentWorkspace && documentWorkspace.connect(openDocument);
    const unsubscribeDocuments = persistence && documentWorkspace && documentWorkspace.subscribe(scheduleRestore);
    projectLoading = Boolean(persistence && persistence.isProjectLoading?.());
    const unsubscribeProject = persistence && persistence.subscribeProject?.(projectChanged);
    layoutStore?.readTabsPosition().then(position => {
        if (!disposed && !tabsChosen && position === 'left') setVerticalTabs(true, false);
    }, () => undefined);
    if (persistence) window.addEventListener('pagehide', flushLayout);
    root.addEventListener('click', guardDocumentClose, true);
    root.addEventListener('keydown', guardDocumentClose, true);
    vm.on('targetsUpdate', refresh);
    refresh();
    return {
        select, selectFromList, targetTabs, openStage, closeStage, split, closeSplit, activateView,
        setViewSection, syncActiveSection, refreshSurfaces,
        rename(id: string) {
            const target = vm.runtime.targets.find(item => item.id === id);
            if (target) openRenameDialog(target);
        },
        selectAsset(id: string, kind: AssetKind, index: number) {
            if (active?.id === id && active.section === (kind === 'costumes' ? 1 : 2)) {
                active.assets.selectors.get(kind)?.(index);
            }
        },
        currentView: () => active && describe(active),
        views: () => [...views.values()].map(view => describe(view)),
        dispose() {
            flushLayout();
            disposed = true;
            window.cancelAnimationFrame(restoreFrame);
            window.clearTimeout(restoreTimeout);
            if (persistence) window.removeEventListener('pagehide', flushLayout);
            if (unsubscribeDocuments) unsubscribeDocuments();
            if (unsubscribeProject) unsubscribeProject();
            if (disconnectDocuments) disconnectDocuments();
            root.removeEventListener('click', guardDocumentClose, true);
            root.removeEventListener('keydown', guardDocumentClose, true);
            for (const item of documents.values()) item.session?.dispose();
            documents.clear();
            stagePane?.attach(null);
            renameDialog?.remove();
            renameDialog = undefined;
            vm.removeListener('targetsUpdate', refresh);
            selection.dispose();
            removal.dispose();
            if (overlay) overlay.dispose();
            drop.dispose();
            if (layout) layout.dispose();
            for (const view of views.values()) disposeView(view);
            content.remove();
            dockview.dispose();
        }
    };
}

type SpriteTabsController<Snapshot> = ReturnType<typeof mountSpriteTabs<Snapshot>>;

type SpriteTabsProps<Snapshot> = Omit<TabOptions<Snapshot>, 'activateSection' | 'getSection' | 'park' | 'onToolbarSlots' | 'onAssetPreviewSlots'> & {
    children: React.ReactNode;
    activateSection?(section: number): void;
    slots: HTMLElement[];
    onAttach(): void;
    enabled: boolean;
    activeSection: number;
    className: string;
    connect(controller: SpriteTabsController<Snapshot> | null): void;
    activeTools?: React.ReactNode;
    renderToolbar?(view: SpriteTabView, actions: ToolbarActions): React.ReactNode;
    getAssetPreview?(targetId: string, kind: SpriteAssetKind): SpriteAssetPreviewData;
    getVariables?(targetId: string): readonly SpriteVariable[];
    getProperties?(targetId: string): SpritePropertiesPanelProps['values'];
    writeProperties?: SpritePropertiesPanelProps['onChange'];
    writeVariable?(targetId: string, id: string, value: SpriteVariable['value']): void;
    editVariable?(targetId: string, edit: SpriteVariableEdit): SpriteVariableEditError | void;
    /** What this target sends and receives. `scanTargetMessages` builds it from the runtime. */
    getMessages?(targetId: string): TargetMessages;
    /** Open the block that sends or receives a message. */
    openMessage?(use: MessageUse): void;
    /** Open a sprite or the stage picked in the stage's relationship diagram. */
    openMessageTarget?(targetId: string): void;
    /** Rename a message everywhere in the project. The stage owns broadcast_msg variables. */
    renameMessage?(message: ProjectMessage, name: string): MessageRenameError | void;
    getCodeSearchItems?(targetId: string): readonly SpriteSearchResult[];
    openCodeSearchResult?(targetId: string, id: string): void;
};

function AssetPreview({locale, data, kind, selected, renderLayout, scrollTop}: {
    locale: string;
    data: SpriteAssetPreviewData;
    kind: SpriteAssetKind;
    selected?: object;
    renderLayout?: SpriteAssetLayout;
    scrollTop?: number;
}) {
    const chosen = data.items.find(item => item.asset === selected) ??
        data.items.find(item => item.asset === data.defaultAsset) ?? data.items[0];
    const peaks = React.useMemo(() => {
        if (!chosen?.buffer?.length) return undefined;
        const samples = chosen.buffer.getChannelData(0);
        const chunk = Math.ceil(samples.length / 192);
        const levels: number[] = [];
        for (let offset = 0; offset < samples.length; offset += chunk) {
            let peak = 0;
            for (let i = offset; i < Math.min(offset + chunk, samples.length); i++) {
                peak = Math.max(peak, Math.abs(samples[i]));
            }
            levels.push(peak);
        }
        return levels;
    }, [chosen?.buffer]);
    const index = chosen ? data.items.indexOf(chosen) : -1;
    const pane = React.createElement(SpriteAssetPane, {
        locale, kind, editable: false, onSelect() {},
        detailOnly: Boolean(renderLayout),
        selectedId: chosen ? String(index) : null,
        items: data.items.map((item, position) => ({
            id: String(position), name: item.name, imageUrl: item.imageUrl,
            duration: item.duration ?? item.buffer?.duration, peaks: item === chosen ? peaks : undefined
        }))
    });
    return renderLayout ? renderLayout(data.items, index, pane, scrollTop ?? 0) : pane;
}

function SpriteTabs<Snapshot>(props: SpriteTabsProps<Snapshot>) {
    const root = React.useRef<HTMLDivElement>(null);
    const sections = React.useRef<HTMLDivElement>(null);
    const parking = React.useRef<HTMLDivElement>(null);
    const latest = React.useRef(props);
    latest.current = props;
    const [content] = React.useState(() => {
        const node = document.createElement('div');
        node.className = 'tw-plus-sprite-tab-editor';
        return node;
    });
    const [toolbarSlots, setToolbarSlots] = React.useState<readonly ToolbarSlot[]>([]);
    const [assetPreviewSlots, setAssetPreviewSlots] = React.useState<readonly AssetPreviewSlot[]>([]);
    const controller = React.useRef<SpriteTabsController<Snapshot>>(null);
    const hasVariables = Boolean(props.getVariables);
    const hasMessages = Boolean(props.getMessages);
    const hasToolbar = Boolean(props.renderToolbar) || hasVariables;
    const hasAssetPreview = Boolean(props.getAssetPreview) || hasVariables || hasMessages;
    React.useLayoutEffect(() => {
        sections.current.append(...props.slots);
        parking.current.appendChild(content);
        latest.current.onAttach();
        const observer = new content.ownerDocument.defaultView.ResizeObserver(() => latest.current.resize());
        observer.observe(sections.current);
        return () => observer.disconnect();
    }, [content, props.slots]);
    React.useLayoutEffect(() => {
        if (!props.enabled) {
            setToolbarSlots([]);
            setAssetPreviewSlots([]);
            content.hidden = false;
            root.current.appendChild(content);
            latest.current.resize();
            return () => content.remove();
        }
        const frame = content.ownerDocument.defaultView;
        let restoreFrame: number;
        const park = () => parking.current?.appendChild(content);
        park();
        const instance = mountSpriteTabs(root.current, content, {
            vm: props.vm,
            getSection: () => latest.current.activeSection,
            activateSection(section) {
                frame.cancelAnimationFrame(restoreFrame);
                if (latest.current.activateSection) {
                    latest.current.activateSection(section);
                    return;
                }
                // Dockview attaches the active panel after dispatching the selection event.
                restoreFrame = frame.requestAnimationFrame(() => {
                    if (content.isConnected && section !== latest.current.activeSection) {
                        content.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')[section]?.click();
                    }
                });
            },
            park,
            renameLabels: props.renameLabels,
            selectTarget: (id, assets) => latest.current.selectTarget(id, assets),
            resize: () => latest.current.resize(),
            reopenLabel: props.reopenLabel,
            multiView: props.multiView,
            workspaceLayout: props.workspaceLayout,
            stagePane: props.stagePane,
            variables: hasVariables,
            messages: hasMessages,
            locale: props.locale,
            viewAdapter: props.viewAdapter,
            popouts: props.popouts && {...props.popouts, className: props.className},
            onToolbarSlots: hasToolbar ? setToolbarSlots : undefined,
            onAssetPreviewSlots: hasAssetPreview ? setAssetPreviewSlots : undefined
        });
        controller.current = instance;
        latest.current.connect(instance);
        if (props.multiView) props.stagePane?.connect({open: instance.openStage, close: instance.closeStage});
        return () => {
            frame.cancelAnimationFrame(restoreFrame);
            controller.current = null;
            latest.current.connect(null);
            props.stagePane?.connect(null);
            instance.dispose();
        };
    }, [content, props.enabled, props.vm, props.reopenLabel, props.multiView, props.locale,
        props.viewAdapter, props.stagePane, props.workspaceLayout, props.renameLabels, props.popouts, props.className,
        hasVariables, hasMessages, hasToolbar, hasAssetPreview]);
    React.useLayoutEffect(() => {
        controller.current?.syncActiveSection(props.activeSection);
    }, [props.activeSection]);
    const workspace = controller.current;
    // The native tab controller also reacts to bubbled events from elements with role="tab".
    const isolateDockviewTabs = (event: React.SyntheticEvent) => {
        if (!content.contains(event.target as Node)) event.stopPropagation();
    };
    return React.createElement('div', {className: props.className,
        'data-multi-view': props.enabled && props.multiView || undefined},
        React.createElement('div', {ref: root, onClick: isolateDockviewTabs, onKeyDown: isolateDockviewTabs}),
        React.createElement('div', {ref: parking, hidden: true}),
        createPortal(React.createElement(React.Fragment, null,
            props.multiView && props.getVariables ? React.createElement('div', {hidden: true}, props.children) : props.children,
            React.createElement('div', {ref: sections, className: 'tw-plus-sprite-tab-sections'})), content), toolbarSlots.map(({view, element}) => {
            const actions = {
                activate: () => { workspace?.activateView(view.id); },
                setSection: (section: number) => {
                    workspace?.setViewSection(view.id, section);
                    workspace?.activateView(view.id);
                }
            };
            const currentSection = spriteEditorSections[view.section] ?? 'code';
            const toolbar = props.renderToolbar?.(view, actions) ?? (props.getVariables &&
                React.createElement(SpriteEditorToolbar, {
                    viewId: view.id, locale: props.locale, section: currentSection, isStage: view.isStage,
                    activeGroup: view.groupActive, propertiesInVariables: Boolean(props.getProperties),
                    // A section with no port behind it would open an empty panel.
                    availableSections: spriteEditorSections.filter(section =>
                        section !== 'messages' || Boolean(props.getMessages)),
                    actions: view.active && currentSection !== 'variables' ? props.activeTools : undefined,
                    onSectionChange: section => actions.setSection(spriteEditorSections.indexOf(section)),
                    search: {
                        onFocus: actions.activate,
                        find(query, section) {
                            let items: readonly SpriteSearchResult[] = [];
                            if (section === 'code') items = props.getCodeSearchItems?.(view.targetId) ?? [];
                            else if (section === 'variables') {
                                items = props.getVariables(view.targetId).map(variable => ({id: variable.id, label: variable.name}));
                            } else if (section === 'messages') {
                                items = (props.getMessages?.(view.targetId).messages ?? [])
                                    .map(message => ({id: message.key, label: message.name}));
                            } else {
                                items = props.getAssetPreview?.(view.targetId, section).items.map((item, index) =>
                                    ({id: String(index), label: item.name})) ?? [];
                            }
                            const text = query.toLocaleLowerCase();
                            return items.filter(item => item.label.toLocaleLowerCase().includes(text));
                        },
                        select(result, section) {
                            actions.activate();
                            if (section === 'code') props.openCodeSearchResult?.(view.targetId, result.id);
                            else if (section === 'variables') {
                                const field = assetPreviewSlots.find(slot => slot.id === view.id)?.element;
                                [...(field?.querySelectorAll<HTMLInputElement>('input[data-variable-id]') ?? [])]
                                    .find(input => input.dataset.variableId === result.id)?.focus();
                            } else if (section === 'messages') {
                                const pane = assetPreviewSlots.find(slot => slot.id === view.id)?.element;
                                [...(pane?.querySelectorAll<HTMLElement>('[data-message-key]') ?? [])]
                                    .find(node => node.dataset.messageKey === result.id)?.focus();
                            } else workspace?.selectAsset(view.id, section, Number(result.id));
                        }
                    }
                }));
            return createPortal(toolbar, element, view.id);
        }), assetPreviewSlots.map(({id, targetId, kind, element, editable, selected, renderLayout, scrollTop}) =>
            createPortal(kind === 'messages' ? React.createElement(SpriteMessagePane, {
                kind, locale: props.locale, editable, data: props.getMessages!(targetId),
                onOpen: props.openMessage,
                onOpenTarget: props.openMessageTarget,
                onRename: props.renameMessage && ((message: ProjectMessage, name: string) => {
                    const result = props.renameMessage!(message, name);
                    if (!result) workspace?.refreshSurfaces();
                    return result;
                })
            }) : kind === 'variables' ? React.createElement(SpriteAssetPane, {
                kind, locale: props.locale, editable, variables: props.getVariables?.(targetId) ?? [],
                properties: props.getProperties?.(targetId),
                targetId,
                onWriteProperties(id: string, patch: Parameters<SpritePropertiesPanelProps['onChange']>[1]) {
                    props.writeProperties?.(id, patch);
                    workspace?.refreshSurfaces();
                },
                onWrite(variableId, value) {
                    props.writeVariable?.(targetId, variableId, value);
                    workspace?.refreshSurfaces();
                },
                onEdit: props.editVariable && (edit => props.editVariable!(targetId, edit))
            }) : props.getAssetPreview && React.createElement(AssetPreview, {
                locale: props.locale, kind, selected, renderLayout, scrollTop, data: props.getAssetPreview(targetId, kind)
            }), element, id)));
}

export function useSpriteTabs<Snapshot>({available, enabled, locale, ...props}:
    Omit<SpriteTabsProps<Snapshot>, 'children' | 'connect' | 'selectTarget' | 'reopenLabel' | 'renameLabels' |
        'slots' | 'onAttach' | 'activateSection'> & {
        available: boolean;
        locale: string;
        activateSection?(section: number): void;
    }) {
    const controller = React.useRef<SpriteTabsController<Snapshot>>(null);
    const [selection, setSelection] = React.useState<{id: string; assets?: AssetSelections}>({id: ''});
    const defaultAssets = React.useMemo<AssetSelections>(() => {
        const forKind = (kind: AssetKind): SpriteAssetSelection => ({
            restore: () => undefined,
            remember() {},
            renderPanel: (render, previewSelector, panel) =>
                React.createElement(NativeAssetPanel, {render, previewSelector, panel, kind, locale})
        });
        return {costumes: forKind('costumes'), sounds: forKind('sounds')};
    }, [locale]);
    const [ready, setReady] = React.useState(false);
    const [slots] = React.useState(() => available ? Array.from({length: 3}, () => {
        const slot = document.createElement('div');
        slot.className = 'tw-plus-sprite-tab-section';
        return slot;
    }) : []);
    const resize = React.useRef(props.resize);
    resize.current = props.resize;
    React.useLayoutEffect(() => {
        slots.forEach((slot, index) => { slot.hidden = index !== props.activeSection; });
        if (slots.length) resize.current();
    }, [slots, props.activeSection]);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const select = (id: string) => controller.current?.select(id);
    const listTabs = enabled && props.multiView ? {
        locale,
        list: (id?: string) => controller.current?.targetTabs(id) ?? [],
        select: (id?: string) => controller.current?.selectFromList(id),
        activate: (id: string) => controller.current?.activateView(id)
    } : null;
    return {
        controller,
        listTabs,
        assetSelections: (enabled ? selection.assets : undefined) ?? defaultAssets,
        context: enabled ? {
            selectedId: selection.id, openLabel: japanese ? '開く' : 'Open', select, open: select,
            rename: props.multiView && props.getProperties ? (id: string) => controller.current?.rename(id) : undefined
        } : null,
        renderEditorTabRow: available ? (children: React.ReactNode) => React.createElement(SpriteTabs<Snapshot>, {
            ...props, enabled, locale, children, slots, onAttach: () => setReady(true),
            selectTarget: (id, assets) => setSelection({id, assets}),
            connect: next => { controller.current = next; },
            reopenLabel: japanese ? '編集中のスプライトを開く' : 'Open the editing sprite',
            renameLabels: japanese ? renameLabels.ja : renameLabels.en
        }) : undefined,
        renderEditorPanel: available ? (index: number, children: React.ReactNode) =>
            ready ? createPortal(children, slots[index]) : null :
            undefined
    };
}
