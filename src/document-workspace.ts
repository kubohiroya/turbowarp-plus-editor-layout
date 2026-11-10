export interface DocumentPanelRequest {
    reference: {providerId: string; documentId: string};
    filename: string;
    /** What the tab shows. Without it the tab names the file and where it comes from. */
    title?: string;
    transient?: boolean;
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
    mount(element: HTMLElement, close: () => void): {requestClose(): void; dispose(): void};
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
    const notify = () => listeners.forEach(listener => listener());
    return {
        open(request: DocumentPanelRequest) {
            if (!open) return false;
            open(request);
            return true;
        },
        connect(handler: NonNullable<typeof open>) {
            open = handler;
            return () => { if (open === handler) open = undefined; };
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
