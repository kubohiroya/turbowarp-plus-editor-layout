/**
 * Keeps the Dockview workspace of each project in IndexedDB, so a project opens with the tabs it was left with.
 *
 * A project is told apart by the file or folder handle it was opened from, by the key the desktop app gives the
 * opened path, or, without either, by its name together with the shape of its sprites. Only the projects used most
 * recently are kept, so layouts of projects nobody opens any more are removed without asking.
 */

export type WorkspaceProjectIdentity =
    | {kind: 'file' | 'directory'; name: string; handle: FileSystemHandle}
    | {kind: 'desktop'; name: string; key: string}
    | {kind: 'anonymous'; name: string};

export type TabsPosition = 'top' | 'left';

/** The saved workspace of one opened project, and where its next changes are written. */
export interface WorkspaceLayoutSession {
    /** The saved layout, if this project has one. */
    readonly layout: string | undefined;
    /** Whether the project was found by its file, folder or desktop key, not only by its name and sprites. */
    readonly exact: boolean;
    /** Whether the project has a saved layout, or a change was written in this session. */
    readonly saved: boolean;
    /** Save the layout. The project's own record is updated, so it never adds a record per change. */
    write(layout: string, signature: string): Promise<void>;
}

export interface WorkspaceLayoutStore {
    open(identity: WorkspaceProjectIdentity, signature: string): Promise<WorkspaceLayoutSession>;
    readTabsPosition(): Promise<TabsPosition | undefined>;
    writeTabsPosition(position: TabsPosition): Promise<void>;
}

export interface WorkspaceLayoutStoreOptions {
    indexedDB?: IDBFactory;
    /** How many projects keep their layout. The least recently used ones are removed past it. */
    limit?: number;
    /** The largest layout that is saved, in bytes. */
    maxBytes?: number;
    now?(): number;
    /** Where earlier versions kept a single layout. It is cleared once, without moving it. */
    legacyStorage?: Pick<Storage, 'removeItem'> | null;
}

/** The database a person can delete from the browser's developer tools to forget every layout. */
export const workspaceLayoutDatabase = 'twPlusWorkspaceLayout';
export const workspaceLayoutLimit = 100;
export const workspaceLayoutMaxBytes = 256 * 1024;

const layoutsStore = 'layouts';
const preferencesStore = 'preferences';
const tabsPositionKey = 'tabsPosition';
const legacyKeys = ['twPlusDockviewLayout', 'twPlusDockviewLayout.tabs'];

interface LayoutRecord {
    id?: number;
    kind: WorkspaceProjectIdentity['kind'];
    name: string;
    handle?: FileSystemHandle;
    desktopKey?: string;
    signature: string;
    layout: string;
    lastUsedAt: number;
}

const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

// Created with the transaction, before any request finishes, so the completion is never missed.
const completion = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('The transaction was aborted.'));
});

function openDatabase(factory: IDBFactory) {
    const request = factory.open(workspaceLayoutDatabase, 1);
    request.onupgradeneeded = () => {
        const database = request.result;
        const layouts = database.createObjectStore(layoutsStore, {keyPath: 'id', autoIncrement: true});
        layouts.createIndex('name', 'name');
        layouts.createIndex('desktopKey', 'desktopKey');
        layouts.createIndex('lastUsedAt', 'lastUsedAt');
        database.createObjectStore(preferencesStore);
    };
    return result(request);
}

const recent = (records: LayoutRecord[]) => records.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

async function find(database: IDBDatabase, identity: WorkspaceProjectIdentity, signature: string) {
    const transaction = database.transaction(layoutsStore, 'readonly');
    const finished = completion(transaction);
    const store = transaction.objectStore(layoutsStore);
    const records = identity.kind === 'desktop' ?
        await result(store.index('desktopKey').getAll(identity.key)) as LayoutRecord[] :
        await result(store.index('name').getAll(identity.name)) as LayoutRecord[];
    await finished;
    const candidates = recent(records.filter(record => record.kind === identity.kind));
    if (identity.kind === 'desktop') return candidates[0];
    if (identity.kind === 'anonymous') return candidates.find(record => record.signature === signature);
    for (const record of candidates) {
        try {
            if (record.handle && await identity.handle.isSameEntry(record.handle)) return record;
        } catch { /* A handle from another browser profile or a removed file cannot be compared. */ }
    }
}

async function touch(database: IDBDatabase, id: number, now: number) {
    const transaction = database.transaction(layoutsStore, 'readwrite');
    const finished = completion(transaction);
    const store = transaction.objectStore(layoutsStore);
    const record = await result(store.get(id)) as LayoutRecord | undefined;
    if (record) store.put({...record, lastUsedAt: now});
    await finished;
}

async function save(database: IDBDatabase, record: LayoutRecord, limit: number) {
    const transaction = database.transaction(layoutsStore, 'readwrite');
    const finished = completion(transaction);
    const store = transaction.objectStore(layoutsStore);
    const id = await result(store.put(record)) as number;
    if (record.id === undefined) {
        // In the same transaction as the new record, so tabs saving at once never keep more than the limit.
        let excess = await result(store.count()) - limit;
        if (excess > 0) {
            const cursor = store.index('lastUsedAt').openCursor();
            await new Promise<void>((resolve, reject) => {
                cursor.onerror = () => reject(cursor.error);
                cursor.onsuccess = () => {
                    const current = cursor.result;
                    if (!current || excess <= 0) return resolve();
                    if (current.primaryKey !== id) {
                        current.delete();
                        excess--;
                    }
                    current.continue();
                };
            });
        }
    }
    await finished;
    return id;
}

function identityFields(identity: WorkspaceProjectIdentity): Pick<LayoutRecord, 'kind' | 'name' | 'handle' | 'desktopKey'> {
    if (identity.kind === 'desktop') return {kind: identity.kind, name: identity.name, desktopKey: identity.key};
    if (identity.kind === 'anonymous') return {kind: identity.kind, name: identity.name};
    return {kind: identity.kind, name: identity.name, handle: identity.handle};
}

const defaultLegacyStorage = () => {
    try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function createWorkspaceLayoutStore({indexedDB: factory = globalThis.indexedDB, limit = workspaceLayoutLimit,
    maxBytes = workspaceLayoutMaxBytes, now = Date.now, legacyStorage = defaultLegacyStorage()}: WorkspaceLayoutStoreOptions = {}):
    WorkspaceLayoutStore {
    let database: Promise<IDBDatabase> | undefined;
    const connect = () => database ??= factory ? openDatabase(factory).then(opened => {
        opened.onversionchange = () => {
            opened.close();
            database = undefined;
        };
        return opened;
    }, error => {
        database = undefined;
        throw error;
    }) : Promise.reject(new Error('IndexedDB is unavailable.'));
    // Writes run one at a time, so a record is created once even when changes come quickly.
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(task: () => Promise<T>) => {
        const next = queue.then(task, task);
        queue = next.catch(() => undefined);
        return next;
    };
    for (const key of legacyKeys) {
        try { legacyStorage?.removeItem(key); } catch { /* Storage can be unavailable. */ }
    }
    const bytes = (text: string) => new TextEncoder().encode(text).length;

    return {
        async open(identity, signature) {
            const opened = await connect();
            const found = await find(opened, identity, signature);
            let id = found?.id;
            let written = false;
            if (id !== undefined) await enqueue(() => touch(opened, id!, now()));
            const fields = identityFields(identity);
            return {
                layout: found?.layout,
                exact: Boolean(found) && identity.kind !== 'anonymous',
                get saved() { return id !== undefined || written; },
                write(layout, nextSignature) {
                    if (bytes(layout) > maxBytes) return Promise.resolve();
                    written = true;
                    return enqueue(async () => {
                        id = await save(opened, {...fields, ...(id !== undefined && {id}), signature: nextSignature, layout,
                            lastUsedAt: now()}, limit);
                    });
                }
            };
        },
        async readTabsPosition() {
            const opened = await connect();
            const transaction = opened.transaction(preferencesStore, 'readonly');
            const value = await result(transaction.objectStore(preferencesStore).get(tabsPositionKey));
            return value === 'left' || value === 'top' ? value : undefined;
        },
        writeTabsPosition(position) {
            return enqueue(async () => {
                const opened = await connect();
                const transaction = opened.transaction(preferencesStore, 'readwrite');
                const finished = completion(transaction);
                transaction.objectStore(preferencesStore).put(position, tabsPositionKey);
                await finished;
            });
        }
    };
}
