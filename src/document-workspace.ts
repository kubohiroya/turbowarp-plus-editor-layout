interface DocumentPanelSession {
    requestClose(): void;
    dispose(): void;
    save?(): void | Promise<void>;
    readonly fileEdit?: {
        directory: FileSystemDirectoryHandle;
        path: string;
        isDirty(): boolean;
        readUnsaved?(): Uint8Array | undefined;
        save(): Promise<void>;
    };
}

export interface DocumentPanelRequest {
    reference: {providerId: string; documentId: string};
    filename: string;
    /** What the tab shows. Without it the tab names the file and where it comes from. */
    title?: string;
    transient?: boolean;
    /** Keeps this utility tab first while the host enables the project folder drawer. */
    pinWithProjectFolder?: boolean;
    /**
     * Opens the tab beside the other open tabs of the same area, in one split panel. The first tab of an area
     * opens in a new split to the right of the active panel, so the area does not mix with the sprite tabs.
     */
    area?: string;
    /**
     * Gathers the tab under a labelled chip with the other tabs of the same `id` in its split panel.
     * `color` is a palette id of the workspace, such as `'green'`, `'red'` or `'blue'`.
     */
    tabGroup?: {id: string; label: string; color?: string; collapsed?: boolean};
    /** Opens the tab behind the active one, as when many tabs are opened at once. */
    inactive?: boolean;
    mount(element: HTMLElement, close: () => void, onSaveAvailable?: () => void): DocumentPanelSession;
}

export const documentPanelTitle = ({title, filename, reference: {providerId, documentId}}: DocumentPanelRequest) =>
    title || `${filename} (${providerId} / ${documentId})`;

interface DocumentPanelSource {
    getPanelRequest(reference: DocumentPanelRequest['reference']): DocumentPanelRequest | undefined;
    subscribePanelRequests(listener: () => void): () => void;
}

function createDocumentWorkspace() {
    let open: ((request: DocumentPanelRequest) => void) | undefined;
    let source: DocumentPanelSource | undefined;
    const listeners = new Set<() => void>();
    let saveScope: 'project' | 'tab' = 'project';
    let activeSession: (() => DocumentPanelSession | undefined) | undefined;
    let sessions: (() => Iterable<DocumentPanelSession | undefined>) | undefined;
    const saveListeners = new Set<() => void>();
    const notifySave = () => saveListeners.forEach(listener => listener());
    const notify = () => listeners.forEach(listener => listener());
    return {
        open(request: DocumentPanelRequest) {
            if (!open) return false;
            open(request);
            return true;
        },
        connect(handler: NonNullable<typeof open>, getActiveSession?: NonNullable<typeof activeSession>,
            getSessions?: NonNullable<typeof sessions>) {
            open = handler;
            activeSession = getActiveSession;
            sessions = getSessions;
            notifySave();
            return () => {
                if (open !== handler) return;
                open = undefined;
                activeSession = undefined;
                sessions = undefined;
                notifySave();
            };
        },
        setSaveScope(scope: typeof saveScope) {
            if (scope === saveScope) return;
            saveScope = scope;
            notifySave();
        },
        get saveScope() {return saveScope;},
        get canSaveActive() {return Boolean(activeSession?.()?.save);},
        saveActive() {return activeSession?.()?.save?.();},
        fileEdits() {
            return Array.from(sessions?.() ?? []).flatMap(session => {
                const file = session?.fileEdit;
                return file?.isDirty() ? [file] : [];
            });
        },
        notifySave,
        subscribeSave(listener: () => void) {
            saveListeners.add(listener);
            return () => {saveListeners.delete(listener);};
        },
        connectSource(next: DocumentPanelSource) {
            source = next;
            const unsubscribe = next.subscribePanelRequests(notify);
            notify();
            return () => {
                unsubscribe();
                if (source === next) source = undefined;
            };
        },
        resolve(reference: DocumentPanelRequest['reference']) {
            return source?.getPanelRequest(reference);
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        }
    };
}

const workspaces = new WeakMap<object, ReturnType<typeof createDocumentWorkspace>>();

export function getDocumentWorkspace(vm: object) {
    let workspace = workspaces.get(vm);
    if (!workspace) {
        workspace = createDocumentWorkspace();
        workspaces.set(vm, workspace);
    }
    return workspace;
}
