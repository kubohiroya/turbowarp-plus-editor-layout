import {isJapanese} from './drawer-views.ts';
import {desktopAgentSettings, type DesktopAiAgentsPort} from './desktop-ai-agents.ts';

/** The services the Editor knows by name. Their name and icon are fixed; their address can be replaced. */
export type AgentPresetId = 'chatgpt' | 'claude';

/**
 * A web service. Desktop applications are stored separately by the Desktop host.
 */
export interface AgentUrlTarget {
    kind: 'url';
    /** An `https:` address: the service's start page or a deep link such as a previous conversation. */
    url: string;
}
export type AgentTarget = AgentUrlTarget;

export interface AgentService {
    id: string;
    preset?: AgentPresetId;
    name: string;
    enabled: boolean;
    target: AgentTarget;
}

export interface AgentSettings {
    version: 1;
    /** The presets in their fixed order, then the user's own services. */
    services: AgentService[];
    unknownServices?: unknown[];
}

export type AgentStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const agentSettingsKey = 'twPlusAiAgents';

export const agentPresets: readonly {id: AgentPresetId; name: string; url: string; letter: string}[] = [
    {id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', letter: 'G'},
    {id: 'claude', name: 'Claude', url: 'https://claude.ai/new', letter: 'C'}
];

export type AgentUrlProblem = 'empty' | 'invalid' | 'not-https';

/** The address to save, or why it cannot be used. Only `https:` addresses are accepted. */
export function checkAgentUrl(value: unknown): {url: string} | {problem: AgentUrlProblem} {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return {problem: 'empty'};
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return {problem: 'invalid'};
    }
    if (url.protocol !== 'https:') return {problem: 'not-https'};
    if (!url.hostname) return {problem: 'invalid'};
    return {url: url.href};
}

const presetService = (preset: (typeof agentPresets)[number], saved?: {enabled?: unknown; target?: {url?: unknown}}): AgentService => {
    const checked = checkAgentUrl(saved?.target?.url);
    return {
        id: preset.id, preset: preset.id, name: preset.name,
        enabled: saved?.enabled !== false,
        target: {kind: 'url', url: 'url' in checked ? checked.url : preset.url}
    };
};

export const defaultAgentSettings = (): AgentSettings => ({version: 1, services: agentPresets.map(preset => presetService(preset))});

/** Reads usable web services and preserves settings for target kinds this version cannot open. */
export function parseAgentSettings(raw: string | null | undefined): AgentSettings {
    let saved: unknown;
    try {
        saved = JSON.parse(raw ?? 'null');
    } catch {
        return defaultAgentSettings();
    }
    if (!saved || typeof saved !== 'object' || (saved as {version?: unknown}).version !== 1 ||
        !Array.isArray((saved as {services?: unknown}).services)) return defaultAgentSettings();
    const entries = (saved as {services: unknown[]}).services.filter(entry => entry && typeof entry === 'object') as
        {id?: unknown; preset?: unknown; name?: unknown; enabled?: unknown; target?: {kind?: unknown; url?: unknown}}[];
    const presets = agentPresets.map(preset => presetService(preset, entries.find(entry => entry.preset === preset.id &&
        (entry.target?.kind === 'url' || entry.target?.kind === undefined))));
    const ids = new Set<string>(presets.map(service => service.id));
    const custom: AgentService[] = [];
    const unknownServices = entries.filter(entry => typeof entry.target?.kind === 'string' && entry.target.kind !== 'url');
    for (const entry of entries) {
        if (entry.preset !== undefined || entry.target?.kind !== 'url') continue;
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const checked = checkAgentUrl(entry.target.url);
        if (!name || !('url' in checked)) continue;
        let id = typeof entry.id === 'string' && entry.id ? entry.id : 'custom';
        for (let n = 2; ids.has(id); n++) id = `${String(entry.id || 'custom')}-${n}`;
        ids.add(id);
        custom.push({id, name, enabled: entry.enabled !== false, target: {kind: 'url', url: checked.url}});
    }
    return {version: 1, services: [...presets, ...custom], ...(unknownServices.length ? {unknownServices} : {})};
}

export const browserStorage = (): AgentStorage | null => {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
};

export function readAgentSettings(storage: AgentStorage | null = browserStorage(), key = agentSettingsKey): AgentSettings {
    try {
        return parseAgentSettings(storage?.getItem(key));
    } catch {
        return defaultAgentSettings();
    }
}

/** Saves the settings; returns false when the storage refuses them. */
export function writeAgentSettings(settings: AgentSettings, storage: AgentStorage | null = browserStorage(),
    key = agentSettingsKey): boolean {
    if (!storage) return false;
    try {
        storage.setItem(key, JSON.stringify({version: 1, services: [...settings.services.map(service => service.preset ?
            {preset: service.preset, enabled: service.enabled, target: service.target} :
            {id: service.id, name: service.name, enabled: service.enabled, target: service.target}), ...(settings.unknownServices ?? [])]}));
        return true;
    } catch {
        return false;
    }
}

export const enabledAgentServices = (settings: AgentSettings) => settings.services.filter(service => service.enabled);

export type Opener = (url: string, target: string, features: string) => unknown;

/** Opens the service in a new tab, without giving it access to the Editor. */
export function openAgentService(service: AgentService, open: Opener = (...args) => window.open(...args)) {
    if (service.target.kind === 'url') open(service.target.url, '_blank', 'noopener,noreferrer');
}

const texts = {
    menu: ['AI エージェント', 'AI agents'],
    settings: ['AI エージェント設定…', 'AI agent settings…'],
    empty: ['メニューに出す AI サービスがありません。設定で選んでください。',
        'No AI services are shown here. Choose them in the settings.'],
    newTab: ['別のタブで開きます', 'Opens in a new tab'],
    title: ['AI エージェント設定', 'AI agent settings'],
    description: ['ドロワーの AI エージェントのメニューに出すサービスを選びます。URL は、以前の会話など https: で始まるアドレスに置き換えられます。',
        'Choose the services the AI agent menu in the drawer shows. Each URL can be replaced by any https: address, such as a previous conversation.'],
    presets: ['用意されたサービス', 'Built-in services'],
    custom: ['追加したサービス', 'Your services'],
    customEmpty: ['まだありません。', 'None yet.'],
    customService: ['追加したサービス', 'Service'],
    show: ['メニューに出す', 'Show in the menu'],
    name: ['名前', 'Name'],
    url: ['URL', 'URL'],
    defaultUrl: ['空欄のときは', 'When empty:'],
    add: ['サービスを追加', 'Add a service'],
    remove: ['削除', 'Remove'],
    cancel: ['キャンセル', 'Cancel'],
    save: ['保存', 'Save'],
    nameEmpty: ['名前を入力してください。', 'Enter a name.'],
    urlEmpty: ['URL を入力してください。', 'Enter a URL.'],
    urlInvalid: ['URL として読めません。https: で始まるアドレスを入力してください。', 'This is not a URL. Enter an address that starts with https:.'],
    urlNotHttps: ['https: で始まるアドレスだけを使えます。', 'Only addresses that start with https: can be used.'],
    saveFailed: ['設定を保存できませんでした。ブラウザーの保存領域が使えません。', 'The settings could not be saved: browser storage is unavailable.']
} as const;
export const agentText = (key: keyof typeof texts, locale: string) => texts[key][isJapanese(locale) ? 0 : 1];


export interface AgentSettingsDialogOptions {
    document?: Document;
    locale: string;
    /** The workbench stylesheet's class names (`editor.css`). */
    styles?: Record<string, string>;
    storage?: AgentStorage | null;
    storageKey?: string;
    /** Where focus goes when the dialog closes. Defaults to the element focused when it opened. */
    returnFocus?: HTMLElement | null;
    onSave?(settings: AgentSettings): void;
    desktop?: DesktopAiAgentsPort | null;
    onDesktopSave?(): void;
}

export interface AgentSettingsDialog {
    element: HTMLElement;
    close(): void;
}

interface Row {
    service?: AgentService;
    group: HTMLElement;
    enabled: HTMLInputElement;
    name?: HTMLInputElement;
    url: HTMLInputElement;
}

let openDialog: AgentSettingsDialog | null = null;
let nextDialog = 0;
const focusable = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const urlProblems = {empty: 'urlEmpty', invalid: 'urlInvalid', 'not-https': 'urlNotHttps'} as const;

/**
 * The settings dialog: turns the presets on and off, replaces their address, and adds or removes the
 * user's own services. It is plain DOM so that any part of the Editor can open it, with or without React.
 */
export function openAgentSettingsDialog({document: doc = globalThis.document, locale, styles = {}, storage = browserStorage(),
    storageKey = agentSettingsKey, returnFocus, onSave, desktop, onDesktopSave}: AgentSettingsDialogOptions): AgentSettingsDialog {
    if (openDialog?.element.isConnected) {
        (openDialog.element.querySelector(focusable) as HTMLElement)?.focus();
        return openDialog;
    }
    const text = (key: keyof typeof texts) => agentText(key, locale);
    const restore = returnFocus ?? doc.activeElement as HTMLElement | null;
    const prefix = `plus-agent-settings-${++nextDialog}`;
    let fieldId = 0;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string | undefined> = {},
        ...children: (Node | string | false | null | undefined)[]) => {
        const node = doc.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) {
            if (value !== undefined) node.setAttribute(name, value);
        }
        for (const child of children) if (child) node.append(child);
        return node;
    };
    const field = (label: string, input: HTMLInputElement) => {
        input.id = `${prefix}-field-${++fieldId}`;
        const error = make('p', {id: `${input.id}-error`, class: styles.aiAgentDialogError, hidden: ''});
        const wrapper = make('div', {class: input.type === 'checkbox' ? styles.aiAgentDialogCheck : styles.aiAgentDialogField},
            ...(input.type === 'checkbox' ? [input, make('label', {for: input.id}, label)] :
                [make('label', {for: input.id}, label), input]), error);
        input.addEventListener('input', () => setError(input, null));
        return wrapper;
    };
    const setError = (input: HTMLInputElement, message: string | null) => {
        const error = doc.getElementById(`${input.id}-error`);
        if (error) {
            error.textContent = message ?? '';
            error.hidden = !message;
        }
        if (message) {
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', `${input.id}-error`);
        } else {
            input.removeAttribute('aria-invalid');
            input.removeAttribute('aria-describedby');
        }
    };
    const checkbox = (checked: boolean) => {
        const input = make('input', {type: 'checkbox'});
        input.checked = checked;
        return input;
    };
    const textInput = (type: string, value: string, placeholder?: string) => {
        const input = make('input', {type, spellcheck: 'false', autocomplete: 'off', placeholder});
        input.value = value;
        return input;
    };

    const settings = readAgentSettings(storage, storageKey);
    const rows: Row[] = [];
    const presetGroup = make('fieldset', {class: styles.aiAgentDialogSection}, make('legend', {}, text('presets')));
    for (const service of settings.services.filter(item => item.preset)) {
        const preset = agentPresets.find(item => item.id === service.preset);
        const enabled = checkbox(service.enabled);
        const url = textInput('url', service.target.url === preset.url ? '' : service.target.url, preset.url);
        const group = make('div', {role: 'group', 'aria-label': service.name, class: styles.aiAgentDialogRow},
            field(`${service.name}${isJapanese(locale) ? ' を' : ': '}${text('show')}`, enabled),
            field(`${service.name} ${text('url')}`, url),
            make('p', {class: styles.aiAgentDialogNote}, `${text('defaultUrl')} ${preset.url}`));
        rows.push({service, group, enabled, url});
        presetGroup.append(group);
    }

    const customList = make('div', {class: styles.aiAgentDialogList});
    const customEmpty = make('p', {class: styles.aiAgentDialogNote}, text('customEmpty'));
    const addButton = make('button', {type: 'button', class: styles.aiAgentDialogButton}, text('add'));
    const custom = () => rows.filter(row => !row.service);
    const renumber = () => {
        custom().forEach((row, index) => row.group.setAttribute('aria-label', `${text('customService')} ${index + 1}`));
        customEmpty.hidden = custom().length > 0;
    };
    const addRow = (service?: AgentService) => {
        const enabled = checkbox(service?.enabled ?? true);
        const name = textInput('text', service?.name ?? '');
        const url = textInput('url', service?.target.url ?? '', 'https://');
        const remove = make('button', {type: 'button', class: styles.aiAgentDialogButton}, text('remove'));
        const group = make('div', {role: 'group', class: styles.aiAgentDialogRow},
            field(text('name'), name), field(text('url'), url), field(text('show'), enabled), remove);
        const row: Row = {group, enabled, name, url};
        remove.addEventListener('click', () => {
            const index = custom().indexOf(row);
            rows.splice(rows.indexOf(row), 1);
            group.remove();
            renumber();
            (custom()[index]?.name ?? custom()[index - 1]?.name ?? addButton).focus();
        });
        rows.push(row);
        customList.append(group);
        renumber();
        return row;
    };
    for (const service of settings.services.filter(item => !item.preset)) addRow(service);
    addButton.addEventListener('click', () => addRow().name.focus());
    const customGroup = make('fieldset', {class: styles.aiAgentDialogSection},
        make('legend', {}, text('custom')), customList, customEmpty, addButton);

    const status = make('p', {role: 'alert', class: styles.aiAgentDialogError, hidden: ''});
    const cancel = make('button', {type: 'button', class: styles.aiAgentDialogButton}, text('cancel'));
    const save = make('button', {type: 'submit', class: `${styles.aiAgentDialogButton ?? ''} ${styles.aiAgentDialogPrimary ?? ''}`.trim()},
        text('save'));
    const form = make('form', {novalidate: '', class: styles.aiAgentDialogForm}, presetGroup, customGroup,
        desktop && desktopAgentSettings(doc, desktop, locale, styles, onDesktopSave), status,
        make('div', {class: styles.aiAgentDialogActions}, cancel, save));
    const element = make('div', {
        role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${prefix}-title`,
        'aria-describedby': `${prefix}-description`, class: styles.aiAgentDialog
    },
    make('h2', {id: `${prefix}-title`}, text('title')),
    make('p', {id: `${prefix}-description`}, text('description')),
    form);
    const backdrop = make('div', {class: styles.aiAgentDialogBackdrop}, element);

    const close = () => {
        if (!backdrop.isConnected) return;
        backdrop.remove();
        if (openDialog?.element === element) openDialog = null;
        if (restore?.isConnected) restore.focus({preventScroll: true});
    };
    cancel.addEventListener('click', close);
    element.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key !== 'Tab') return;
        const items = [...element.querySelectorAll<HTMLElement>(focusable)].filter(item => !item.matches(':disabled'));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && doc.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        status.hidden = true;
        const invalid: HTMLInputElement[] = [];
        const services: AgentService[] = [];
        for (const row of rows) {
            const preset = row.service && agentPresets.find(item => item.id === row.service.preset);
            const checked = preset && !row.url.value.trim() ? {url: preset.url} : checkAgentUrl(row.url.value);
            const problem = 'problem' in checked ? text(urlProblems[checked.problem]) : null;
            setError(row.url, problem);
            const name = row.name?.value.trim() ?? row.service.name;
            if (row.name) setError(row.name, name ? null : text('nameEmpty'));
            if (row.name && !name) invalid.push(row.name);
            if (problem) invalid.push(row.url);
            if (!('url' in checked) || !name) continue;
            services.push(preset ? {...row.service, enabled: row.enabled.checked, target: {kind: 'url', url: checked.url}} : {
                id: '', name, enabled: row.enabled.checked, target: {kind: 'url', url: checked.url}
            });
        }
        if (invalid.length) {
            invalid[0].focus();
            return;
        }
        let count = 0;
        for (const service of services) if (!service.preset) service.id = `custom-${++count}`;
        const saved: AgentSettings = {...settings, services};
        if (!writeAgentSettings(saved, storage, storageKey)) {
            status.textContent = text('saveFailed');
            status.hidden = false;
            return;
        }
        close();
        onSave?.(saved);
    });

    doc.body.append(backdrop);
    rows[0]?.enabled.focus();
    openDialog = {element, close};
    return openDialog;
}
