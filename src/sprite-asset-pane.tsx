import React from 'react';
import {observeTileNameTitles} from './native-tile-title.ts';
import {SpritePropertiesPanel, type SpritePropertiesPanelProps} from './sprite-properties.tsx';
import type {SpriteAssetKind, SpriteAssetPreviewItem} from './sprite-tabs.ts';
import {cloudVariablePrefix, type SpriteVariableEdit, type SpriteVariableEditError} from './sprite-variable-edit.ts';

interface NativeAssetPanelProps {
    children?: React.ReactNode;
    buttons: readonly {title: string; img: string; onClick(): void}[];
    items: readonly {dragPayload?: object; name: string; url?: string; details?: React.ReactNode}[];
    isRtl?: boolean;
    listActions?: React.ElementType;
    selectedItemIndex: number;
    onItemClick(index: number): void;
}

interface NativeSelectorProps extends NativeAssetPanelProps {
    wrapperAttributes?: Record<string, string>;
    listRef?(node: HTMLElement | null): void;
    onListScroll?(event: React.UIEvent<HTMLElement>): void;
    draggingType?: null;
    onAddSortable?(): void;
    onRemoveSortable?(): void;
}

export type NativeAssetSelector = React.ComponentType<NativeSelectorProps>;
export type NativeAssetPanelRenderer = (props: NativeAssetPanelProps, options: {
    panelAttributes: Record<string, string>;
    detailAttributes: Record<string, string>;
    renderSelector(Component: NativeAssetSelector, props: NativeSelectorProps): React.ReactNode;
}) => React.ReactNode;

export type SpriteAssetLayout = (items: readonly SpriteAssetPreviewItem[], index: number,
    detail: React.ReactNode, scrollTop: number) => React.ReactNode;

interface PanelState {
    rememberLayout(render: SpriteAssetLayout): void;
    getScrollTop(): number;
    rememberScrollTop(position: number): void;
}

const noop = () => {};

function NativeAssetPanelSurface({render, panel, kind, state, previewSelector, scrollTop}: {
    render: NativeAssetPanelRenderer;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    state?: PanelState;
    previewSelector?: NativeAssetSelector;
    scrollTop?: number;
}) {
    const list = React.useRef<HTMLElement | null>(null);
    const stopObserving = React.useRef<() => void>();
    const setList = React.useCallback((node: HTMLElement | null) => {
        stopObserving.current?.();
        list.current = node;
        stopObserving.current = observeTileNameTitles(node);
    }, []);
    React.useLayoutEffect(() => {
        const position = state?.getScrollTop() ?? scrollTop;
        if (list.current && position !== undefined) list.current.scrollTop = position;
    }, [state, scrollTop]);
    return render(panel, {
        panelAttributes: {'data-layout-asset-panel': kind ?? ''},
        detailAttributes: {'data-layout-asset-detail': ''},
        renderSelector(Component, props) {
            const selectorProps = {...props, listRef: setList, wrapperAttributes: {'data-layout-asset-list': ''}};
            if (previewSelector) {
                return <div {...{inert: ''}} style={{display: 'contents'}}>
                    {React.createElement(previewSelector, {
                        ...selectorProps, draggingType: null, onAddSortable: noop, onRemoveSortable: noop
                    })}
                </div>;
            }
            return <Component {...selectorProps} onListScroll={event => {
                state?.rememberScrollTop(event.currentTarget.scrollTop);
            }} />;
        }
    });
}

export function NativeAssetPanel({render, previewSelector, panel, kind, locale = 'en', state}: {
    render: NativeAssetPanelRenderer;
    previewSelector: NativeAssetSelector;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    locale?: string;
    state?: PanelState;
}) {
    const {items, buttons, isRtl, listActions} = panel;
    React.useLayoutEffect(() => {
        if (!state) return;
        const previousItems = new Map(items.map(item => [item.dragPayload, item]));
        const readOnlyButtons = buttons.map(({title, img}) => ({title, img, onClick: noop}));
        state.rememberLayout((previewItems, selectedItemIndex, detail, scrollTop) => <NativeAssetPanelSurface
            render={render} kind={kind} previewSelector={previewSelector} scrollTop={scrollTop} panel={{
                isRtl, listActions, selectedItemIndex, buttons: readOnlyButtons,
                onItemClick: noop, children: detail,
                items: previewItems.map(item => {
                    const previous = previousItems.get(item.asset);
                    return {name: item.name, url: item.imageUrl || previous?.url, details: previous?.details};
                })
            }} />);
    }, [state, render, previewSelector, items, buttons, isRtl, listActions, kind]);
    const activePanel = kind === 'sounds' ? {
        ...panel,
        children: <>
            {items.length === 0 && <p className="tw-sprite-media__empty">{labelsFor(locale).emptySounds}</p>}
            {panel.children}
        </>
    } : panel;
    return <NativeAssetPanelSurface render={render} panel={activePanel} kind={kind} state={state} />;
}

export interface SpriteMediaAsset {
    /** Host identity for this item within its target, independent of the list order. */
    id: string;
    name: string;
    imageUrl?: string;
    duration?: number;
    /** Downsampled waveform magnitudes in the range from zero to one. */
    peaks?: readonly number[];
}

export interface SpriteVariable {
    id: string;
    name: string;
    value: string | number;
    scope?: 'local' | 'global';
    isCloud?: boolean;
}

interface PaneProps {
    locale: string;
    editable: boolean;
}

export interface SpriteMediaPaneProps extends PaneProps {
    kind: 'costumes' | 'sounds';
    items: readonly SpriteMediaAsset[];
    selectedId: string | null;
    detailOnly?: boolean;
    onSelect(id: string): void;
    /** Optional host surface. It must honor editable without unmounting its layout. */
    renderEditor?(selected: SpriteMediaAsset, editable: boolean): React.ReactNode;
}

export interface SpriteVariablePaneProps extends PaneProps {
    kind: 'variables';
    variables: readonly SpriteVariable[];
    properties?: SpritePropertiesPanelProps['values'];
    targetId?: string;
    onWriteProperties?: SpritePropertiesPanelProps['onChange'];
    onWrite(id: string, value: SpriteVariable['value']): void;
    onEdit?(edit: SpriteVariableEdit): SpriteVariableEditError | void;
}

export type SpriteAssetPaneProps = SpriteMediaPaneProps | SpriteVariablePaneProps;

const english = {
    costumes: 'Costumes', sounds: 'Sounds', variables: 'Variables', name: 'Variable name', value: 'Variable value',
    local: 'Sprite', global: 'Project', cloudVariable: 'Cloud variable', emptyCostumes: 'No costumes', emptySounds: 'No sounds',
    emptyVariables: 'No variables', selectCostume: 'Select a costume', selectSound: 'Select a sound',
    imageUnavailable: 'Image unavailable', waveformUnavailable: 'Waveform unavailable', waveform: 'Waveform',
    seconds: 's', actions: 'Actions', create: 'Create variable', rename: 'Rename variable', delete: 'Delete variable',
    cancel: 'Cancel', ok: 'OK', close: 'Close', confirmDelete: 'Delete', createTitle: 'New Variable',
    renameTitle: 'Rename Variable', deleteTitle: 'Delete Variable', newName: 'New variable name:',
    deletePrompt: 'Delete variable “%1”?', emptyName: 'Enter a variable name.',
    duplicateName: 'A variable with this name is already in scope.',
    inUse: 'This variable is used by a block. Remove its uses before deleting it.',
    unavailable: 'This variable or target is no longer available.'
};
const japanese: typeof english = {
    costumes: 'コスチューム', sounds: '音', variables: '変数', name: '変数名', value: '変数の値',
    local: 'スプライト', global: '作品', cloudVariable: 'クラウド変数', emptyCostumes: 'コスチュームがありません', emptySounds: '音がありません',
    emptyVariables: '変数がありません', selectCostume: 'コスチュームを選択してください', selectSound: '音を選択してください',
    imageUnavailable: '画像を表示できません', waveformUnavailable: '波形を表示できません', waveform: '波形',
    seconds: '秒', actions: '操作', create: '変数を作る', rename: '変数名を変更', delete: '変数を削除',
    cancel: 'キャンセル', ok: 'OK', close: '閉じる', confirmDelete: '削除', createTitle: '新しい変数',
    renameTitle: '変数名を変更', deleteTitle: '変数を削除', newName: '新しい変数名:',
    deletePrompt: '変数「%1」を削除しますか？', emptyName: '変数名を入力してください。',
    duplicateName: '同じ名前の変数がすでにあります。',
    inUse: 'この変数はブロックで使用中です。削除するには、先に参照を外してください。',
    unavailable: 'この変数または編集対象を操作できなくなりました。'
};
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;

function Waveform({name, peaks, label}: {name: string; peaks: readonly number[]; label: string}) {
    const path = peaks.map((sample, index) => {
        const x = (index + 0.5) * 100 / peaks.length;
        const magnitude = Number.isFinite(sample) ? Math.max(0, Math.min(sample, 1)) : 0;
        const y = magnitude * 49;
        return 'M' + x + ' ' + (50 - y) + 'V' + (50 + y);
    }).join(' ');
    return <svg className="tw-sprite-media__waveform" viewBox="0 0 100 100" preserveAspectRatio="none"
        role="img" aria-label={label + ': ' + name}>
        <path d="M0 50H100" vectorEffect="non-scaling-stroke" className="tw-sprite-media__axis" />
        <path d={path} vectorEffect="non-scaling-stroke" className="tw-sprite-media__peaks" />
    </svg>;
}

function MediaPane({kind, items, selectedId, onSelect, renderEditor, editable, locale, detailOnly}: SpriteMediaPaneProps) {
    const labels = labelsFor(locale);
    const isSound = kind === 'sounds';
    const selected = items.find(asset => asset.id === selectedId);
    const duration = selected?.duration;
    return <section className={detailOnly ? 'tw-sprite-media tw-sprite-media--detail' : 'tw-sprite-media'} aria-label={labels[kind]}>
        {!detailOnly && <ul className="tw-sprite-media__list" aria-label={labels[kind]}>
            {items.map(asset => <li key={asset.id}>
                <button type="button" className="tw-sprite-media__item" title={asset.name} aria-current={asset.id === selectedId || undefined}
                    aria-disabled={!editable || undefined} tabIndex={editable ? 0 : -1} onClick={() => {
                        if (editable) onSelect(asset.id);
                    }}>
                    {asset.imageUrl ? <img src={asset.imageUrl} alt="" className="tw-sprite-media__thumbnail" /> :
                        <span className="tw-sprite-media__symbol" aria-hidden="true">{isSound ? '♪' : '◫'}</span>}
                    <span className="tw-sprite-media__name">{asset.name}</span>
                </button>
            </li>)}
        </ul>}
        <div className="tw-sprite-media__detail">
            {selected ? <>
                <h3 className="tw-sprite-media__title">{selected.name}</h3>
                <div className="tw-sprite-media__surface">
                    {renderEditor?.(selected, editable) ?? (isSound ?
                        (selected.peaks?.length ? <Waveform peaks={selected.peaks} name={selected.name} label={labels.waveform} /> :
                            <p>{labels.waveformUnavailable}</p>) :
                        (selected.imageUrl ? <img src={selected.imageUrl} alt={selected.name} className="tw-sprite-media__preview" /> :
                            <p>{labels.imageUnavailable}</p>))}
                </div>
                {isSound && Number.isFinite(duration) && duration >= 0 &&
                    <p className="tw-sprite-media__duration">{new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(duration)} {labels.seconds}</p>}
            </> : <p>{items.length ? (isSound ? labels.selectSound : labels.selectCostume) :
                (isSound ? labels.emptySounds : labels.emptyCostumes)}</p>}
        </div>
    </section>;
}

function VariableField({variable, editable, onWrite}: {
    variable: SpriteVariable;
    editable: boolean;
    onWrite: SpriteVariablePaneProps['onWrite'];
}) {
    const [text, setText] = React.useState<string | null>(null);
    const pending = React.useRef<{text: string; variable: SpriteVariable; write: typeof onWrite} | null>(null);
    const finish = (save: boolean) => {
        const draft = pending.current;
        if (!draft) return;
        pending.current = null;
        setText(null);
        if (!save || draft.text === String(variable.value)) return;
        const number = Number(draft.text);
        const value = typeof draft.variable.value === 'number' && draft.text.trim() && Number.isFinite(number) ?
            number : draft.text;
        draft.write(draft.variable.id, value);
    };

    React.useLayoutEffect(() => {
        // A click can change the active pane before the old input receives blur.
        if (!editable) finish(true);
    }, [editable]);

    return <input className="tw-sprite-variables__input" aria-label={variable.name} data-variable-id={variable.id} readOnly={!editable}
        tabIndex={editable ? 0 : -1} value={text ?? String(variable.value)}
        onChange={event => {
            if (!editable) return;
            const next = event.currentTarget.value;
            pending.current = {text: next, variable, write: onWrite};
            setText(next);
        }}
        onBlur={() => finish(true)}
        onKeyDown={event => {
            if (!editable || event.nativeEvent.isComposing) return;
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === 'Enter');
        }} />;
}

const variableName = (variable: SpriteVariable) => variable.isCloud && variable.name.startsWith(cloudVariablePrefix) ?
    variable.name.slice(cloudVariablePrefix.length) : variable.name;

type VariableLabels = ReturnType<typeof labelsFor>;

const iconProps = {viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false} as const;
const PlusIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon"><path d="M8 3.5v9M3.5 8h9" /></svg>;
const PenIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon">
    <path d="M10.6 2.9l2.5 2.5-7.4 7.4-3.2.7.7-3.2z M9.3 4.2l2.5 2.5" />
</svg>;
const TrashIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon">
    <path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.2 4.3l.7 8.9h6.2l.7-8.9M6.8 6.8v4.1M9.2 6.8v4.1" />
</svg>;
const CloseIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>;

/** A modal shaped like Scratch's “New Variable” prompt, shown in the top layer above every pane. */
function VariableDialog({action, labels, targetName, error, onSubmit, onClose}: {
    action: SpriteVariableEdit;
    labels: VariableLabels;
    targetName: string;
    error?: SpriteVariableEditError;
    onSubmit(event: React.FormEvent<HTMLFormElement>): void;
    onClose(): void;
}) {
    const dialog = React.useRef<HTMLDialogElement>(null);
    const titleId = React.useId();
    const inputId = React.useId();
    const isDelete = action.type === 'delete';
    React.useLayoutEffect(() => {
        const node = dialog.current;
        if (!node) return;
        if (typeof node.showModal === 'function') {
            if (!node.open) node.showModal();
        } else node.setAttribute('open', '');
        // React focuses autoFocus elements before the dialog opens, so focus the intended control here.
        const initial = node.querySelector<HTMLElement>('[data-initial-focus]');
        initial?.focus();
        if (initial instanceof HTMLInputElement) initial.select();
        return () => {
            if (node.open && typeof node.close === 'function') node.close();
        };
    }, []);
    const title = action.type === 'create' ? labels.createTitle : action.type === 'rename' ? labels.renameTitle : labels.deleteTitle;
    return <dialog ref={dialog} className="tw-sprite-variables__dialog" aria-labelledby={titleId}
        onCancel={event => {
            event.preventDefault();
            onClose();
        }}
        onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }}
        onClick={event => {
            // The content fills the dialog box, so a click on the dialog itself is a click on the backdrop.
            if (event.target === event.currentTarget) onClose();
        }}>
        <div className="tw-sprite-variables__dialog-header">
            <h2 id={titleId} className="tw-sprite-variables__dialog-title">{title}</h2>
            <button type="button" className="tw-sprite-variables__dialog-close" aria-label={labels.close} onClick={onClose}>
                <CloseIcon />
            </button>
        </div>
        <form className="tw-sprite-variables__dialog-body" onSubmit={onSubmit}>
            {isDelete ? <p className="tw-sprite-variables__dialog-message">{labels.deletePrompt.replace('%1', targetName)}</p> : <>
                <label className="tw-sprite-variables__dialog-label" htmlFor={inputId}>{labels.newName}</label>
                <input id={inputId} className="tw-sprite-variables__dialog-input" name="name" defaultValue={action.name}
                    autoComplete="off" spellCheck={false} data-initial-focus="" />
            </>}
            {error && <p role="alert" className="tw-sprite-variables__dialog-error">{labels[error]}</p>}
            <div className="tw-sprite-variables__dialog-buttons">
                <button type="button" className="tw-sprite-variables__dialog-button" onClick={onClose}
                    data-initial-focus={isDelete ? '' : undefined}>{labels.cancel}</button>
                <button type="submit" className="tw-sprite-variables__dialog-button tw-sprite-variables__dialog-button--ok">
                    {isDelete ? labels.confirmDelete : labels.ok}
                </button>
            </div>
        </form>
    </dialog>;
}

function VariablePane({variables, editable, onWrite, onEdit, locale, properties, targetId, onWriteProperties}: SpriteVariablePaneProps) {
    const labels = labelsFor(locale);
    const [action, setAction] = React.useState<SpriteVariableEdit | null>(null);
    const [error, setError] = React.useState<SpriteVariableEditError | undefined>();
    const start = (next: SpriteVariableEdit | null) => {
        setError(undefined);
        setAction(next);
    };
    React.useLayoutEffect(() => {
        if (!editable) start(null);
    }, [editable]);
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!onEdit || !editable || !action) return;
        const result = onEdit(action.type === 'delete' ? action :
            {...action, name: String(new FormData(event.currentTarget).get('name') ?? '')});
        if (result) setError(result);
        else start(null);
    };
    const selected = action && action.type !== 'create' ? variables.find(variable => variable.id === action.id) : undefined;
    return <section className="tw-sprite-variables" aria-label={labels.variables}>
        <div className={onEdit ? 'tw-sprite-variables__scroll tw-sprite-variables__scroll--with-add' : 'tw-sprite-variables__scroll'}>
            {properties && targetId && onWriteProperties &&
                <SpritePropertiesPanel targetId={targetId} values={properties} locale={locale}
                    disabled={!editable} onChange={onWriteProperties} />}
            {variables.length ? <table className="tw-sprite-variables__table">
                <thead><tr><th scope="col">{labels.name}</th><th scope="col">{labels.value}</th>
                    {onEdit && <th scope="col" className="tw-sprite-variables__actions-cell">{labels.actions}</th>}
                </tr></thead>
                <tbody>{variables.map(variable => <tr key={variable.id}>
                    <th scope="row">
                        {variable.isCloud && <>
                            <span className="tw-sprite-variables__cloud" role="img" aria-label={labels.cloudVariable}>☁︎</span>{' '}
                        </>}
                        {variableName(variable)}
                        {variable.scope && <span className="tw-sprite-variables__scope">{labels[variable.scope]}</span>}
                    </th>
                    <td><VariableField variable={variable} editable={editable} onWrite={onWrite} /></td>
                    {onEdit && <td className="tw-sprite-variables__actions-cell">
                        <div className="tw-sprite-variables__actions">
                            <button type="button" className="tw-sprite-variables__action" disabled={!editable}
                                onClick={() => start({type: 'rename', id: variable.id, name: variableName(variable)})}>
                                <PenIcon />{labels.rename}
                            </button>
                            <button type="button" className="tw-sprite-variables__action tw-sprite-variables__action--delete"
                                disabled={!editable} onClick={() => start({type: 'delete', id: variable.id})}>
                                <TrashIcon />{labels.delete}
                            </button>
                        </div>
                    </td>}
                </tr>)}</tbody>
            </table> : <p>{labels.emptyVariables}</p>}
        </div>
        {onEdit && <button type="button" className="tw-sprite-variables__add" disabled={!editable}
            onClick={() => start({type: 'create', name: ''})}>
            <span className="tw-sprite-variables__add-icon"><PlusIcon /></span>
            <span className="tw-sprite-variables__add-label">{labels.create}</span>
        </button>}
        {editable && action && <VariableDialog key={action.type === 'create' ? 'create' : action.type + action.id}
            action={action} labels={labels} error={error} onSubmit={submit} onClose={() => start(null)}
            targetName={selected ? variableName(selected) : ''} />}
    </section>;
}

export function SpriteAssetPane(props: SpriteAssetPaneProps) {
    return props.kind === 'variables' ? <VariablePane {...props} /> : <MediaPane {...props} />;
}
