import {isJapanese} from './drawer-views.ts';

export interface DesktopAgentDraft {
    id: string;
    name: string;
    args: string[];
    cwd: string;
    selection?: string;
    url?: string;
}

export interface DesktopAgent extends DesktopAgentDraft {
    application: string;
}

type AgentContext = Record<'projectFolder' | 'repository' | 'branch', string | null>;
type AgentList = {revision: string | null; entries: DesktopAgent[]};
type Result<T> = {ok: true; value: T} | {ok: false; code: string};

/** The Desktop host owns the executable paths, confirmations and launch settings. */
export interface DesktopAiAgentsPort {
    list(): Promise<Result<AgentList>>;
    context(): Promise<Result<AgentContext>>;
    chooseContext(kind: 'project' | 'repository'): Promise<Result<AgentContext | null>>;
    chooseApp(): Promise<Result<{selection: string; application: string} | null>>;
    save(revision: string | null, entries: DesktopAgentDraft[]): Promise<Result<AgentList>>;
    launch(id: string): Promise<Result<null>>;
}

const defaultDirectory = '{projectFolder}';
const variables = /\{(projectFolder|repository|branch)\}/gu;
const strings = {
    section: ['Desktop applications', 'デスクトップアプリ'],
    opensApp: ['Launches a desktop application', 'デスクトップアプリを起動します'],
    add: ['Add an application', 'アプリを追加'],
    name: ['Name', '名前'],
    application: ['Application', 'アプリ'],
    choose: ['Choose…', '選択…'],
    unselected: ['No application selected', 'アプリが選択されていません'],
    args: ['Arguments (one per line)', '引数（1 行に 1 つ）'],
    cwd: ['Working directory', '作業ディレクトリ'],
    url: ['Fallback website (optional)', '代わりに開く Web サイト（任意）'],
    openFallback: ['Open the website', 'Web サイトを開く'],
    'invalid-url': ['Enter an HTTPS address for the fallback website.', '代わりに開く Web サイトには HTTPS の URL を入力してください。'],
    variables: ['Available placeholders: {projectFolder}, {repository}, {branch}.', '使える置き換えは {projectFolder}・{repository}・{branch} です。'],
    chooseProject: ['Choose project folder…', 'プロジェクトフォルダを選択…'],
    chooseRepository: ['Choose Git repository…', 'Git リポジトリを選択…'],
    projectFolder: ['Project folder', 'プロジェクトフォルダ'],
    repository: ['Git repository', 'Git リポジトリ'],
    branch: ['Branch', 'ブランチ'],
    preview: ['Expanded arguments', '置き換え後の引数'],
    up: ['Move up', '上へ移動'],
    down: ['Move down', '下へ移動'],
    remove: ['Remove application', 'アプリを削除'],
    save: ['Save applications', 'アプリの設定を保存'],
    saved: ['Application settings saved.', 'アプリの設定を保存しました。'],
    test: ['Try launching', '試しに起動'],
    saveFirst: ['Save the application before trying it.', '試しに起動するには、先にアプリの設定を保存してください。'],
    launched: ['Launch requested.', 'アプリを起動しました。'],
    invalid: ['Enter a name and choose an application for each entry.', '各項目の名前を入力し、アプリを選択してください。'],
    conflict: ['The application settings changed. Reopen the settings and try again.', 'アプリの設定が変更されました。設定を開き直してからやり直してください。'],
    busy: ['Another application operation is in progress.', '別のアプリ操作を実行中です。'],
    cancelled: ['The operation was cancelled.', '操作をキャンセルしました。'],
    unknown: ['This application is no longer registered.', 'このアプリは登録されていません。'],
    'missing-context': ['Choose the folder or repository used by the launch arguments. A branch is required for {branch}.',
        '引数で使うフォルダまたはリポジトリを選択してください。{branch} にはブランチが必要です。'],
    'invalid-directory': ['The working directory is unavailable.', '作業ディレクトリを利用できません。'],
    'app-missing': ['The selected application is missing or cannot run.', '選択したアプリが見つからないか、起動できません。'],
    'launch-failed': ['The application could not start.', 'アプリを起動できませんでした。'],
    unavailable: ['Desktop application settings are unavailable.', 'デスクトップアプリの設定を利用できません。']
} as const;

export const desktopAgentText = (key: keyof typeof strings, locale: string) => strings[key][isJapanese(locale) ? 1 : 0];
export const desktopAgentError = (code: string, locale: string) =>
    desktopAgentText(Object.hasOwn(strings, code) ? code as keyof typeof strings : 'unavailable', locale);

export async function agentRequest<T>(request: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
        return await request();
    } catch {
        return {ok: false, code: 'unavailable'};
    }
}

/** An optional section of the existing settings dialog. Its changes are saved by the Desktop host. */
export function desktopAgentSettings(doc: Document, port: DesktopAiAgentsPort, locale: string, styles: Record<string, string>) {
    const text = (key: keyof typeof strings) => desktopAgentText(key, locale);
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, content?: string) => {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content) node.textContent = content;
        return node;
    };
    const button = (key: keyof typeof strings, action: () => void) => {
        const node = make('button', styles.aiAgentDialogButton, text(key));
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    };
    const field = (key: keyof typeof strings, input: HTMLElement) => {
        const label = make('label', styles.aiAgentDialogField, text(key));
        label.append(input);
        return label;
    };
    const list = make('div', styles.aiAgentDialogList);
    const status = make('p', styles.aiAgentDialogNote);
    status.setAttribute('role', 'status');
    const section = make('fieldset', styles.aiAgentDialogSection);
    let entries: DesktopAgent[] = [];
    let saved: AgentList = {revision: null, entries: []};
    let context: AgentContext | null = null;
    const previews = new Map<string, () => void>();

    const run = async <T,>(request: () => Promise<Result<T>>, done: (value: T) => void) => {
        const focused = doc.activeElement as HTMLElement | null;
        section.disabled = true;
        status.textContent = '';
        const result = await agentRequest(request);
        if (!section.isConnected) return;
        section.disabled = false;
        if ('code' in result) status.textContent = desktopAgentError(result.code, locale);
        else done(result.value);
        if (doc.activeElement === doc.body && focused?.isConnected && section.contains(focused)) focused.focus();
    };
    const contextSummary = make('p', styles.aiAgentDialogNote);
    contextSummary.style.overflowWrap = 'anywhere';
    const refreshPreviews = () => {
        contextSummary.textContent = (['projectFolder', 'repository', 'branch'] as const)
            .map(key => `${text(key)} ${context?.[key] ?? '—'}`).join(' · ');
        previews.forEach(render => render());
    };
    const chooseContext = (kind: 'project' | 'repository') => {
        void run(() => port.chooseContext(kind), value => {
            if (value) context = value;
            refreshPreviews();
        });
    };
    const add = button('add', () => {
        const entry = {id: globalThis.crypto.randomUUID(), name: '', application: '', args: [], cwd: defaultDirectory};
        entries.push(entry);
        render();
        list.lastElementChild?.querySelector('input')?.focus();
    });
    const toDraft = ({id, name, args, cwd, selection, url}: DesktopAgent): DesktopAgentDraft =>
        ({id, name, args, cwd, ...(selection ? {selection} : {}), ...(url?.trim() ? {url: url.trim()} : {})});
    const save = button('save', () => {
        if (entries.some(entry => !entry.name.trim() || !entry.application)) {
            status.textContent = text('invalid');
            return;
        }
        void run(() => port.save(saved.revision, entries.map(toDraft)), value => {
            saved = value;
            entries = value.entries.map(entry => ({...entry}));
            render();
            status.textContent = text('saved');
        });
    });

    function render() {
        previews.clear();
        list.replaceChildren();
        for (const [index, entry] of entries.entries()) {
            const row = make('div', styles.aiAgentDialogRow);
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', entry.name || text('application'));
            const name = make('input');
            name.maxLength = 120;
            name.value = entry.name;
            name.oninput = () => {
                entry.name = name.value;
                row.setAttribute('aria-label', entry.name || text('application'));
            };
            const application = make('p', styles.aiAgentDialogNote, entry.application || text('unselected'));
            const choose = button('choose', () => {
                void run(() => port.chooseApp(), value => {
                    if (value) Object.assign(entry, value);
                    application.textContent = entry.application || text('unselected');
                });
            });
            choose.setAttribute('aria-label', `${text('application')} ${text('choose')}`);
            const args = make('textarea');
            args.rows = 3;
            args.value = entry.args.join('\n');
            const cwd = make('input');
            cwd.placeholder = defaultDirectory;
            cwd.maxLength = 1024;
            cwd.value = entry.cwd;
            const url = make('input');
            url.type = 'url';
            url.maxLength = 2048;
            url.value = entry.url ?? '';
            url.oninput = () => { entry.url = url.value; };
            const preview = make('p', styles.aiAgentDialogNote);
            const updatePreview = () => {
                const expand = (value: string) => value.replace(variables, (match, key: keyof AgentContext) => context?.[key] ?? match);
                const directory = (entry.cwd.trim() || defaultDirectory);
                preview.textContent = `${text('preview')} ${JSON.stringify(entry.args.map(expand))}\n${text('cwd')} ${
                    directory === defaultDirectory && !context?.projectFolder ? '—' : expand(directory)}`;
            };
            preview.style.whiteSpace = 'pre-wrap';
            preview.style.overflowWrap = 'anywhere';
            previews.set(entry.id, updatePreview);
            updatePreview();
            args.oninput = () => {
                entry.args = args.value ? args.value.split('\n') : [];
                updatePreview();
            };
            cwd.oninput = () => {
                entry.cwd = cwd.value;
                updatePreview();
            };
            const move = (offset: number) => {
                entries.splice(index, 1);
                entries.splice(index + offset, 0, entry);
                render();
                list.children[index + offset].querySelector('input')?.focus();
            };
            const up = button('up', () => move(-1));
            const down = button('down', () => move(1));
            up.disabled = index === 0;
            down.disabled = index === entries.length - 1;
            const remove = button('remove', () => {
                entries.splice(index, 1);
                render();
                (list.children[Math.min(index, entries.length - 1)]?.querySelector('input') ?? add).focus();
            });
            const tryLaunch = button('test', () => {
                const original = saved.entries.find(item => item.id === entry.id);
                if (!original || JSON.stringify(toDraft(original)) !== JSON.stringify(toDraft(entry))) {
                    status.textContent = text('saveFirst');
                    return;
                }
                void run(() => port.launch(entry.id), () => { status.textContent = text('launched'); });
            });
            row.append(field('name', name), application, choose, field('args', args), field('cwd', cwd), preview, field('url', url),
                up, down, remove, tryLaunch);
            list.append(row);
        }
    }

    section.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') event.preventDefault();
    });
    section.append(make('legend', undefined, text('section')), make('p', styles.aiAgentDialogNote, text('variables')),
        button('chooseProject', () => chooseContext('project')), button('chooseRepository', () => chooseContext('repository')),
        contextSummary, list, add, save, status);
    section.disabled = true;
    // The dialog attaches this section to the document before the requests resolve.
    void Promise.all([agentRequest(() => port.list()), agentRequest(() => port.context())]).then(([settings, current]) => {
        if (!section.isConnected) return;
        if ('code' in settings) {
            status.textContent = desktopAgentError(settings.code, locale);
            return;
        }
        saved = settings.value;
        entries = saved.entries.map(entry => ({...entry}));
        if ('value' in current) context = current.value;
        refreshPreviews();
        section.disabled = false;
        render();
    });
    return section;
}
