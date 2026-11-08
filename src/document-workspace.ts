export interface DocumentPanelRequest {
    reference: {providerId: string; documentId: string};
    filename: string;
    /** What the tab shows. Without it the tab names the file and where it comes from. */
    title?: string;
    transient?: boolean;
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
