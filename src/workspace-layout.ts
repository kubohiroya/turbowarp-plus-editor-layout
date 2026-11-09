import {Orientation} from 'dockview';
import type {SerializedDockview} from 'dockview';
import type {DocumentPanelRequest} from './document-workspace.ts';

type Grid = SerializedDockview['grid'];
type Node = Grid['root'];
export type PanelReference =
    | {kind: 'sprite'; name: string; stage: boolean; section: number}
    | {kind: 'stage'}
    | ({kind: 'document'} & DocumentPanelRequest['reference']);

export interface WindowPosition {left: number; top: number; width: number; height: number}

/** Panels that were open in one separate window when the layout was saved. */
export interface SavedPopout {panels: string[]; position?: WindowPosition}

export interface WorkspaceLayout {
    version: 1;
    project: string;
    grid: Grid;
    activeGroup: string;
    editingView?: string;
    panels: Record<string, PanelReference>;
    /** Separate windows are restored docked; the user reopens each one. */
    popouts?: SavedPopout[];
}

type Popout = NonNullable<SerializedDockview['popoutGroups']>[number];
type GroupPanelViewState = Exclude<Node['data'], readonly unknown[]>;

function leafViews(node: Node, output: GroupPanelViewState[] = []): GroupPanelViewState[] {
    if (Array.isArray(node.data)) for (const child of node.data) leafViews(child, output);
    else output.push(node.data);
    return output;
}

/**
 * Move the panels of every separate window back into the docked grid, next to the group they came from, and
 * keep where each window was. Groups that Dockview hid or emptied when a panel moved out are shown again or
 * removed, so the saved grid never depends on a window that has to open on load.
 */
export function dockPopoutGroups(grid: Grid, activeGroup: string | undefined, popoutGroups: readonly Popout[] = []):
    {grid: Grid; activeGroup: string; popouts: SavedPopout[]} | undefined {
    const copy = (node: Node): Node => Array.isArray(node.data) ?
        {type: 'branch', size: node.size, data: node.data.map(copy)} :
        {type: 'leaf', size: node.size, data: {...node.data, views: [...node.data.views]}};
    const root = copy(grid.root);
    const leaves = new Map(leafViews(root).map(data => [data.id, data]));
    const firstFilled = () => [...leaves.values()].find(data => data.views.length) ?? leaves.values().next().value;
    let active = activeGroup;
    const popouts: SavedPopout[] = [];
    for (const popout of popoutGroups) {
        const groups = popout.data ? [popout.data] : popout.grid ? leafViews(popout.grid.root) : [];
        const views = groups.flatMap(group => group.views);
        if (!views.length) continue;
        const target = leaves.get(popout.gridReferenceGroup!) ?? leaves.get(activeGroup!) ?? firstFilled();
        if (!target) return;
        const wasEmpty = !target.views.length;
        for (const view of views) if (!target.views.includes(view)) target.views.push(view);
        if (wasEmpty) target.activeView = groups[0].activeView ?? views[0];
        if (groups.some(group => group.id === activeGroup)) active = target.id;
        const position = popout.position;
        popouts.push(position ? {panels: views, position: {left: position.left, top: position.top,
            width: position.width, height: position.height}} : {panels: views});
    }
    const trim = (node: Node): Node | undefined => {
        if (!Array.isArray(node.data)) return node.data.views.length ? node : undefined;
        const data = node.data.flatMap(child => trim(child) ?? []);
        return data.length ? {...node, data} : undefined;
    };
    const kept = trim(root);
    if (!kept) return;
    const remaining = new Set(leafViews(kept).map(data => data.id));
    if (!active || !remaining.has(active)) active = leafViews(kept)[0].id;
    return {grid: {...grid, root: Array.isArray(kept.data) ? kept : {type: 'branch', size: grid.width, data: [kept]}},
        activeGroup: active, popouts};
}

/** Keep a reopened window on the current screen even if the monitors changed since it was saved. */
export function positionOnScreen(position: WindowPosition, screen: {availLeft?: number; availTop?: number;
    availWidth: number; availHeight: number}): WindowPosition {
    const left0 = screen.availLeft ?? 0;
    const top0 = screen.availTop ?? 0;
    const width = Math.min(Math.max(position.width, 200), screen.availWidth);
    const height = Math.min(Math.max(position.height, 150), screen.availHeight);
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    return {width, height, left: clamp(position.left, left0, left0 + screen.availWidth - width),
        top: clamp(position.top, top0, top0 + screen.availHeight - height)};
}

export function workspaceWithoutTransientPanels(grid: Grid, activeGroup: string, transient: ReadonlySet<string>,
    editingView?: string): {grid: Grid; activeGroup: string} | undefined {
    if (!transient.size) return {grid, activeGroup};
    const groups = new Map<string, readonly string[]>();
    const trim = (node: Node): Node | undefined => {
        if (Array.isArray(node.data)) {
            const data = node.data.flatMap(child => {
                const kept = trim(child);
                return kept ? [kept] : [];
            });
            return data.length ? {...node, data} : undefined;
        }
        const views = node.data.views.filter(id => !transient.has(id));
        if (!views.length) return;
        const activeView = views.includes(node.data.activeView!) ? node.data.activeView : views[0];
        groups.set(node.data.id, views);
        return {...node, data: {...node.data, views, activeView}};
    };
    const root = trim(grid.root);
    if (!root) return;
    if (groups.has(activeGroup)) return {grid: {...grid, root}, activeGroup};
    const fallback = [...groups].find(([, views]) => editingView && views.includes(editingView));
    return {grid: {...grid, root}, activeGroup: fallback?.[0] ?? groups.keys().next().value!};
}

const limit = 256;
const validId = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 1024;
const coordinate = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
const size = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Rebuild only the supported docked grid and logical panel references from storage. */
export function readWorkspaceLayout(raw: string, project: string): WorkspaceLayout | undefined {
    if (raw.length > 1024 * 1024) return;
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return; }
    if (!record(input) || input.version !== 1 || input.project !== project || !record(input.grid) ||
        !record(input.panels) || !validId(input.activeGroup)) return;
    const {width, height, orientation} = input.grid;
    if (!size(width) || !width || !size(height) || !height ||
        (orientation !== Orientation.HORIZONTAL && orientation !== Orientation.VERTICAL)) return;
    const groups = new Set<string>();
    const ids = new Set<string>();
    let nodes = 0;
    function readNode(node: unknown, depth: number): Node | undefined {
        if (depth > 32 || ++nodes > limit || !record(node) || !size(node.size)) return;
        if (node.type === 'branch' && Array.isArray(node.data) && node.data.length > 0 && node.data.length <= limit) {
            const data: Node[] = [];
            for (const child of node.data) {
                const next = readNode(child, depth + 1);
                if (!next) return;
                data.push(next);
            }
            return {type: 'branch', size: node.size, data};
        }
        if (node.type !== 'leaf' || !record(node.data)) return;
        const {id, views, activeView} = node.data;
        if (!validId(id) || groups.has(id) || !Array.isArray(views) || !views.length ||
            views.length > limit || !validId(activeView) || !views.includes(activeView)) return;
        groups.add(id);
        for (const panel of views) {
            if (!validId(panel) || ids.has(panel) || ids.size >= limit) return;
            ids.add(panel);
        }
        return {type: 'leaf', size: node.size, data: {id, views, activeView}};
    }
    const root = readNode(input.grid.root, 0);
    if (root?.type !== 'branch' || !groups.has(input.activeGroup) ||
        ids.size !== Object.keys(input.panels).length) return;
    const panels: WorkspaceLayout['panels'] = Object.create(null);
    const documents = new Set<string>();
    let hasStage = false;
    for (const id of ids) {
        const panel = input.panels[id];
        if (!Object.hasOwn(input.panels, id) || !record(panel)) return;
        if (panel.kind === 'sprite' && validId(panel.name) && typeof panel.stage === 'boolean' &&
            typeof panel.section === 'number' && Number.isInteger(panel.section) && panel.section >= 0 && panel.section <= 3) {
            panels[id] = {kind: 'sprite', name: panel.name, stage: panel.stage, section: panel.section};
        } else if (panel.kind === 'stage' && !hasStage) {
            hasStage = true;
            panels[id] = {kind: 'stage'};
        } else if (panel.kind === 'document' && validId(panel.providerId) && validId(panel.documentId)) {
            const key = JSON.stringify([panel.providerId, panel.documentId]);
            if (documents.has(key)) return;
            documents.add(key);
            panels[id] = {kind: 'document', providerId: panel.providerId, documentId: panel.documentId};
        } else return;
    }
    const editingView = input.editingView;
    if (editingView !== undefined && (!validId(editingView) || panels[editingView]?.kind !== 'sprite')) return;
    const popouts = readPopouts(input.popouts, panels);
    if (!popouts) return;
    return {version: 1, project, grid: {root, width, height, orientation}, activeGroup: input.activeGroup,
        editingView: typeof editingView === 'string' ? editingView : undefined, panels,
        ...(popouts.length && {popouts})};
}

function readPopouts(input: unknown, panels: WorkspaceLayout['panels']): SavedPopout[] | undefined {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > limit) return;
    const seen = new Set<string>();
    const output: SavedPopout[] = [];
    for (const item of input) {
        if (!record(item) || !Array.isArray(item.panels) || !item.panels.length) return;
        for (const id of item.panels) {
            if (!validId(id) || seen.has(id) || panels[id]?.kind !== 'sprite') return;
            seen.add(id);
        }
        const position = item.position;
        if (position === undefined) {
            output.push({panels: [...item.panels]});
            continue;
        }
        if (!record(position) || !coordinate(position.left) || !coordinate(position.top) ||
            !size(position.width) || !position.width || !size(position.height) || !position.height) return;
        output.push({panels: [...item.panels], position: {left: position.left, top: position.top,
            width: position.width, height: position.height}});
    }
    return output;
}
