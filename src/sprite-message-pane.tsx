import React from 'react';
import type {
    MessageGraph, MessageGraphNode, MessageRenameError, MessageStatus, MessageUse, ProjectMessage, TargetMessages
} from './project-messages.ts';
import {checkMessageRename, receiveOpcode} from './project-messages.ts';

export type {MessageRenameError};

export interface SpriteMessagePaneProps {
    kind: 'messages';
    locale: string;
    editable: boolean;
    data: TargetMessages;
    /** Open the block that sends or receives the message. */
    onOpen?(use: MessageUse): void;
    /** Open a sprite or the stage from the diagram. */
    onOpenTarget?(targetId: string): void;
    onRename?(message: ProjectMessage, name: string): MessageRenameError | void;
}

const english = {
    panel: 'Messages',
    sent: 'Sent',
    received: 'Received',
    elsewhere: 'Used elsewhere in this project',
    message: 'Message',
    block: 'Block',
    script: 'Script',
    actions: 'Actions',
    rename: 'Rename',
    cancel: 'Cancel',
    name: 'Message name',
    projectWide: 'Renaming a message changes it everywhere in the project.',
    noSends: 'This sprite sends no messages.',
    noReceives: 'This sprite receives no messages.',
    noSendsStage: 'The stage sends no messages.',
    noReceivesStage: 'The stage receives no messages.',
    noElsewhere: 'Every message in this project is used here.',
    emptyName: 'Enter a message name.',
    duplicateName: 'A message with this name already exists.',
    unavailable: 'This message can no longer be renamed.',
    sendOnly: 'No receivers',
    receiveOnly: 'Never sent',
    unused: 'Unused',
    diagram: 'Messages between sprites and the stage',
    senders: 'Sends',
    messages: 'Message',
    receivers: 'Receives',
    stage: 'Stage',
    noMessages: 'This project has no messages.',
    openBlock: 'Open this block',
    openTarget: 'Open this sprite',
    uses: '%1 sending, %2 receiving',
    broadcast: 'broadcast %1',
    broadcastAndWait: 'broadcast %1 and wait',
    whenReceived: 'when I receive %1',
    hats: {
        event_whenflagclicked: 'when green flag clicked',
        event_whenkeypressed: 'when key pressed',
        event_whenthisspriteclicked: 'when this sprite clicked',
        event_whenstageclicked: 'when stage clicked',
        event_whenbackdropswitchesto: 'when backdrop switches to',
        event_whengreaterthan: 'when value greater than',
        control_start_as_clone: 'when I start as a clone',
        procedures_definition: 'block definition'
    } as Record<string, string>
};

const japanese: typeof english = {
    panel: 'メッセージ',
    sent: '送信',
    received: '受信',
    elsewhere: 'この作品の他の場所のメッセージ',
    message: 'メッセージ',
    block: 'ブロック',
    script: 'スクリプト',
    actions: '操作',
    rename: '名前を変更',
    cancel: 'キャンセル',
    name: 'メッセージ名',
    projectWide: 'メッセージの名前を変えると、作品全体で変わります。',
    noSends: 'このスプライトはメッセージを送っていません。',
    noReceives: 'このスプライトはメッセージを受け取っていません。',
    noSendsStage: '背景はメッセージを送っていません。',
    noReceivesStage: '背景はメッセージを受け取っていません。',
    noElsewhere: 'この作品のメッセージはすべてここで使われています。',
    emptyName: 'メッセージ名を入力してください。',
    duplicateName: '同じ名前のメッセージがすでにあります。',
    unavailable: 'このメッセージの名前を変更できなくなりました。',
    sendOnly: '受け取るブロックがありません',
    receiveOnly: '送るブロックがありません',
    unused: '使われていません',
    diagram: 'スプライト・背景とメッセージの関係',
    senders: '送信元',
    messages: 'メッセージ',
    receivers: '受信先',
    stage: '背景',
    noMessages: 'この作品にはメッセージがありません。',
    openBlock: 'このブロックを開く',
    openTarget: 'このスプライトを開く',
    uses: '送信 %1 件・受信 %2 件',
    broadcast: '%1を送る',
    broadcastAndWait: '%1を送って待つ',
    whenReceived: '%1を受け取ったとき',
    hats: {
        event_whenflagclicked: '緑の旗が押されたとき',
        event_whenkeypressed: 'キーが押されたとき',
        event_whenthisspriteclicked: 'このスプライトが押されたとき',
        event_whenstageclicked: 'ステージが押されたとき',
        event_whenbackdropswitchesto: '背景が切り替わったとき',
        event_whengreaterthan: '値が大きくなったとき',
        control_start_as_clone: 'クローンされたとき',
        procedures_definition: 'ブロックの定義'
    }
};

type Labels = typeof english;
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;
const quoted = (name: string) => '「' + name + '」';

const blockLabel = (labels: Labels, use: MessageUse) => {
    const name = quoted(use.name);
    if (use.direction === 'receive') return labels.whenReceived.replace('%1', name);
    return (use.wait ? labels.broadcastAndWait : labels.broadcast).replace('%1', name);
};

const scriptLabel = (labels: Labels, use: MessageUse) => {
    if (use.scriptOpcode === receiveOpcode && use.scriptMessageName !== undefined) {
        return labels.whenReceived.replace('%1', quoted(use.scriptMessageName));
    }
    return labels.hats[use.scriptOpcode] ?? use.scriptOpcode.replaceAll('_', ' ');
};

function Status({labels, status}: {labels: Labels; status: MessageStatus}) {
    if (status === 'both') return null;
    return <span className="tw-sprite-messages__status" data-status={status}>{labels[status]}</span>;
}

function RenameForm({labels, message, onSubmit, onCancel}: {
    labels: Labels;
    message: ProjectMessage;
    onSubmit(name: string): MessageRenameError | void;
    onCancel(): void;
}) {
    const [error, setError] = React.useState<MessageRenameError | undefined>();
    return <form className="tw-sprite-messages__editor" aria-label={labels.rename}
        onSubmit={event => {
            event.preventDefault();
            const result = onSubmit(String(new FormData(event.currentTarget).get('name') ?? ''));
            if (result) setError(result);
            else onCancel();
        }}
        onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        }}>
        <input className="tw-sprite-messages__input" name="name" aria-label={labels.name}
            defaultValue={message.name} autoFocus onChange={() => setError(undefined)} />
        <button type="submit" className="tw-sprite-messages__button">{labels.rename}</button>
        <button type="button" className="tw-sprite-messages__button" onClick={onCancel}>{labels.cancel}</button>
        <p className="tw-sprite-messages__hint">{labels.projectWide}</p>
        {error && <p role="alert">{labels[error]}</p>}
    </form>;
}

const nodeHeight = 26;
const nodeGap = 10;
const nodeWidth = 150;
const columnGap = 70;
const diagramWidth = nodeWidth * 3 + columnGap * 2;
const shorten = (name: string) => name.length > 18 ? name.slice(0, 17) + '…' : name;

function Diagram({labels, graph, onOpenTarget}: {
    labels: Labels;
    graph: MessageGraph;
    onOpenTarget?(targetId: string): void;
}) {
    const senders = graph.targets.filter(target =>
        graph.edges.some(edge => edge.direction === 'send' && edge.targetId === target.id));
    const receivers = graph.targets.filter(target =>
        graph.edges.some(edge => edge.direction === 'receive' && edge.targetId === target.id));
    const rows = Math.max(senders.length, receivers.length, graph.messages.length);
    if (!graph.messages.length) return <p className="tw-sprite-messages__empty">{labels.noMessages}</p>;
    const height = Math.max(1, rows) * (nodeHeight + nodeGap) + nodeGap;
    const place = (items: readonly unknown[], index: number) =>
        (height - items.length * (nodeHeight + nodeGap) + nodeGap) / 2 + index * (nodeHeight + nodeGap);
    const columns = [0, nodeWidth + columnGap, (nodeWidth + columnGap) * 2];
    const targetY = (list: readonly MessageGraphNode[], id: string) => {
        const index = list.findIndex(target => target.id === id);
        return index < 0 ? undefined : place(list, index) + nodeHeight / 2;
    };
    const messageY = (key: string) => {
        const index = graph.messages.findIndex(message => message.key === key);
        return index < 0 ? undefined : place(graph.messages, index) + nodeHeight / 2;
    };

    const node = (x: number, y: number, label: string, title: string, open?: () => void) => {
        const interactive = Boolean(open);
        return <g key={x + ':' + y + ':' + title} className="tw-sprite-messages__node"
            role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? title : undefined} onClick={open}
            onKeyDown={interactive ? event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open();
            } : undefined}>
            <title>{title}</title>
            <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx="5" />
            <text x={x + nodeWidth / 2} y={y + nodeHeight / 2} textAnchor="middle" dominantBaseline="central">
                {shorten(label)}
            </text>
        </g>;
    };

    return <figure className="tw-sprite-messages__diagram">
        <figcaption>{labels.diagram}</figcaption>
        <svg viewBox={'0 -18 ' + diagramWidth + ' ' + (height + 18)} role="group" aria-label={labels.diagram}>
            {[labels.senders, labels.messages, labels.receivers].map((heading, index) =>
                <text key={heading} className="tw-sprite-messages__column" x={columns[index] + nodeWidth / 2} y={-6}
                    textAnchor="middle">{heading}</text>)}
            {graph.edges.map(edge => {
                const fromMessage = edge.direction === 'receive';
                const from = fromMessage ? messageY(edge.messageKey) : targetY(senders, edge.targetId);
                const to = fromMessage ? targetY(receivers, edge.targetId) : messageY(edge.messageKey);
                if (from === undefined || to === undefined) return null;
                const left = columns[fromMessage ? 1 : 0] + nodeWidth;
                const right = columns[fromMessage ? 2 : 1];
                const middle = (left + right) / 2;
                return <path key={edge.direction + edge.targetId + edge.messageKey}
                    className="tw-sprite-messages__edge"
                    d={'M' + left + ' ' + from + 'C' + middle + ' ' + from + ' ' + middle + ' ' + to +
                        ' ' + right + ' ' + to} />;
            })}
            {senders.map((target, index) => node(columns[0], place(senders, index),
                target.isStage ? labels.stage : target.name,
                (target.isStage ? labels.stage : target.name) + (onOpenTarget ? ' — ' + labels.openTarget : ''),
                onOpenTarget && (() => onOpenTarget(target.id))))}
            {graph.messages.map((message, index) => {
                const counts = labels.uses
                    .replace('%1', String(graph.edges.filter(edge =>
                        edge.direction === 'send' && edge.messageKey === message.key).length))
                    .replace('%2', String(graph.edges.filter(edge =>
                        edge.direction === 'receive' && edge.messageKey === message.key).length));
                const status = message.status === 'both' ? '' : ' — ' + labels[message.status];
                return node(columns[1], place(graph.messages, index), message.name,
                    quoted(message.name) + ' — ' + counts + status);
            })}
            {receivers.map((target, index) => node(columns[2], place(receivers, index),
                target.isStage ? labels.stage : target.name,
                (target.isStage ? labels.stage : target.name) + (onOpenTarget ? ' — ' + labels.openTarget : ''),
                onOpenTarget && (() => onOpenTarget(target.id))))}
        </svg>
    </figure>;
}

function Group({labels, title, uses, empty, byKey, editable, renaming, onOpen, onRename, onStartRename}: {
    labels: Labels;
    title: string;
    uses: readonly MessageUse[];
    empty: string;
    byKey: Map<string, ProjectMessage>;
    editable: boolean;
    renaming: string | null;
    onOpen?(use: MessageUse): void;
    onRename?: SpriteMessagePaneProps['onRename'];
    onStartRename(key: string | null): void;
}) {
    return <section className="tw-sprite-messages__group" aria-label={title}>
        <h3 className="tw-sprite-messages__title">{title}</h3>
        {uses.length ? <table className="tw-sprite-messages__table">
            <thead><tr>
                <th scope="col">{labels.message}</th>
                <th scope="col">{labels.block}</th>
                <th scope="col">{labels.script}</th>
                {onRename && <th scope="col">{labels.actions}</th>}
            </tr></thead>
            <tbody>{uses.map(use => {
                const message = byKey.get(use.key);
                return <tr key={use.blockId}>
                    <th scope="row">
                        {onOpen ? <button type="button" className="tw-sprite-messages__link" data-message-key={use.key}
                            title={labels.openBlock} onClick={() => onOpen(use)}>{use.name}</button> :
                            <span data-message-key={use.key} tabIndex={-1}>{use.name}</span>}
                        {message && <Status labels={labels} status={message.status} />}
                    </th>
                    <td>{blockLabel(labels, use)}</td>
                    <td>{scriptLabel(labels, use)}</td>
                    {onRename && <td>
                        {renaming === use.key && message ?
                            <RenameForm labels={labels} message={message}
                                onSubmit={name => onRename(message, name)}
                                onCancel={() => onStartRename(null)} /> :
                            <button type="button" className="tw-sprite-messages__button" disabled={!editable}
                                onClick={() => onStartRename(use.key)}>{labels.rename}</button>}
                    </td>}
                </tr>;
            })}</tbody>
        </table> : <p className="tw-sprite-messages__empty">{empty}</p>}
    </section>;
}

export function SpriteMessagePane({locale, editable, data, onOpen, onOpenTarget, onRename}: SpriteMessagePaneProps) {
    const labels = labelsFor(locale);
    const [renaming, setRenaming] = React.useState<string | null>(null);
    React.useLayoutEffect(() => {
        if (!editable) setRenaming(null);
    }, [editable]);
    const byKey = React.useMemo(() => new Map(data.messages.map(message => [message.key, message])),
        [data.messages]);
    const rename: SpriteMessagePaneProps['onRename'] = onRename && ((message, name) => {
        const result = checkMessageRename(data.messages, message, name);
        if ('error' in result) return result.error;
        if ('name' in result) return onRename(message, result.name);
        return undefined;
    });
    const group = (title: string, uses: readonly MessageUse[], empty: string) =>
        <Group {...{labels, title, uses, empty, byKey, editable, renaming, onOpen, onStartRename: setRenaming}}
            onRename={rename} />;

    return <section className="tw-sprite-messages" aria-label={labels.panel}>
        {group(labels.sent, data.sends, data.isStage ? labels.noSendsStage : labels.noSends)}
        {group(labels.received, data.receives, data.isStage ? labels.noReceivesStage : labels.noReceives)}
        <section className="tw-sprite-messages__group" aria-label={labels.elsewhere}>
            <h3 className="tw-sprite-messages__title">{labels.elsewhere}</h3>
            {data.elsewhere.length ? <ul className="tw-sprite-messages__list">
                {data.elsewhere.map(message => <li key={message.key}>
                    <span data-message-key={message.key} tabIndex={-1}>{message.name}</span>
                    <Status labels={labels} status={message.status} />
                    {rename && (renaming === message.key ?
                        <RenameForm labels={labels} message={message}
                            onSubmit={name => rename(message, name)}
                            onCancel={() => setRenaming(null)} /> :
                        <button type="button" className="tw-sprite-messages__button" disabled={!editable}
                            onClick={() => setRenaming(message.key)}>{labels.rename}</button>)}
                </li>)}
            </ul> : <p className="tw-sprite-messages__empty">{labels.noElsewhere}</p>}
        </section>
        {data.graph && <Diagram labels={labels} graph={data.graph} onOpenTarget={onOpenTarget} />}
    </section>;
}
