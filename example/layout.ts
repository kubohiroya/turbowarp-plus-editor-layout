import type {CSSProperties, ReactNode, RefCallback} from 'react';
import {createLayout} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createStandardLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/standard-layout';
declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

interface SplitLayoutState {
    observe: RefCallback<HTMLDivElement>;
    bodyStyle?: CSSProperties;
    editorStyle?: CSSProperties;
    stageColumnStyle?: CSSProperties;
    columnSplitter?: ReactNode;
    rowSplitter?: ReactNode;
}

interface StandardLayoutState extends SplitLayoutState {
    bodyClassName?: string;
    stageClassName?: string;
    targetClassName?: string;
    renderEditorTabRow?: (tabs: ReactNode) => ReactNode;
}

const h = React.createElement;
const SplitLayout = createLayout(React);
const App = () => {
    const [enabled, setEnabled] = React.useState(true);
    return h(React.Fragment, null,
        h('button', {onClick: () => setEnabled(value => !value), 'aria-pressed': enabled}, 'Split layout'),
        h(SplitLayout, {
            enabled, fullscreen: false, rtl: false, stageTools: undefined,
            labels: {columns: 'Editor width', rows: 'Stage height'},
            minimumEditor: 220, minimumStageColumn: 180, minimumStageRow: 180, minimumTargets: 100,
            defaultStageWidth: 340, defaultStageHeight: 180,
            stageAspect: 4 / 3, horizontalInset: 0, verticalInset: 0,
            storage: localStorage, storageKey: 'layout-example', separatorClassName: 'separator',
            render: (layout: SplitLayoutState) => h('div', {className: 'panes', ref: layout.observe, style: layout.bodyStyle},
                h('div', {className: 'editor', style: layout.editorStyle}, 'Editor'),
                layout.columnSplitter,
                h('div', {className: 'stage-column', style: {...layout.stageColumnStyle,
                    ...(layout.stageColumnStyle && {width: 'auto'})}},
                    h('div', {className: 'stage'}, 'Stage'),
                    layout.rowSplitter,
                    h('div', {className: 'targets'}, 'Targets')))
        }));
};
const styles = new Proxy({}, {get: (_, key) => String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())});
const context = React.createContext({});
const {StandardLayout} = createStandardLayout(React, {styles, targetStyles: styles, context, LayoutMenu: undefined});
const params = new URLSearchParams(location.search);
const StandardExample = () => h(StandardLayout, {
    enabled: params.get('standard') === '1',
    splitter: false, windowLayout: false, stageActionEnabled: false, windowTools: undefined, Container: undefined,
    defaultStageWidth: 340, defaultStageHeight: 180, stageAspect: 4 / 3,
    onPaletteModeChange: (horizontal: boolean) => { document.documentElement.dataset.palette = horizontal ? 'top' : 'side'; },
    render: (layout: StandardLayoutState) => h('div', {
        className: ['panes', layout.bodyClassName].filter(Boolean).join(' '),
        ref: layout.observe, style: layout.bodyStyle
    },
    h('div', {className: 'editor', style: layout.editorStyle},
        layout.renderEditorTabRow?.(h('span', null, 'Code')), h('textarea', {'aria-label': 'Editor'})),
    h('div', {className: 'stage-column', style: layout.stageColumnStyle},
        h('div', {className: layout.stageClassName, 'data-stage': ''}, 'Stage'),
        h('div', {className: layout.targetClassName}, 'Targets')))
});
ReactDOM.createRoot(document.getElementById('root')!).render(h(params.has('standard') ? StandardExample : App));
