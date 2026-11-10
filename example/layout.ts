import type {CSSProperties, ReactNode, RefCallback} from 'react';
import {createLayout} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createStandardLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/standard-layout';
import type {DrawerViews} from '@kubohiroya/turbowarp-plus-editor-workbench/standard-layout';
import {createAiAgents} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client') & typeof import('react-dom');

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
const {StandardLayout, TargetLayout, SpritePropertiesSection, useSpriteListTools} =
    createStandardLayout(React, {styles, targetStyles: styles, context, LayoutMenu: undefined});
const params = new URLSearchParams(location.search);
const locale = params.get('lang') ?? 'en';
const ja = locale === 'ja';

// `?drawer=1` registers sample drawer views the way the Editor's site layer will.
const drawerViews: DrawerViews | undefined = params.get('drawer') === '1' ? {
    views: [{
        id: 'project',
        render: () => h('ul', {'aria-label': ja ? 'プロジェクトのファイル' : 'Project files'},
            ['project.source.json', 'assets/', 'sb3-source.json'].map(name => h('li', {key: name}, name))),
        tools: () => h('button', {type: 'button'}, ja ? '更新' : 'Refresh')
    }, {
        id: 'git-history',
        render: () => h('ol', {'aria-label': ja ? 'コミット' : 'Commits'},
            ['Add a sprite', 'Initial commit'].map(name => h('li', {key: name}, name)))
    }],
    // The package's own AI agent menu; choosing a service records it instead of opening a tab.
    agents: createAiAgents(React, {styles, open: url => { document.documentElement.dataset.agent = url; }}).drawerMenu
} : undefined;

function SpriteList() {
    const {mount, renderTools} = useSpriteListTools();
    const tools = renderTools(h('button', {type: 'button', 'aria-label': ja ? 'アンドック' : 'Undock sprite list'}, '↗'));
    return h(React.Fragment, null, mount ? ReactDOM.createPortal(tools, mount) : tools,
        h('ul', {'aria-label': ja ? 'スプライト' : 'Sprite tiles'}, h('li', null, 'Sprite1'), h('li', null, ja ? '背景' : 'Backdrop')));
}

const StandardExample = () => h(StandardLayout, {
    enabled: params.get('standard') === '1',
    splitter: false, windowLayout: false, stageActionEnabled: false, windowTools: undefined, Container: undefined,
    defaultStageWidth: 340, defaultStageHeight: 180, stageAspect: 4 / 3, locale,
    storage: localStorage, storageKey: 'standard-example', drawerViews,
    onPaletteModeChange: (horizontal: boolean) => { document.documentElement.dataset.palette = horizontal ? 'top' : 'side'; },
    render: (layout: StandardLayoutState) => h('div', {
        className: ['panes', layout.bodyClassName].filter(Boolean).join(' '),
        ref: layout.observe, style: layout.bodyStyle
    },
    h('div', {className: 'editor', style: layout.editorStyle},
        layout.renderEditorTabRow?.(h('span', null, 'Code')), h('textarea', {'aria-label': 'Editor'})),
    h('div', {className: 'stage-column', style: layout.stageColumnStyle},
        h('div', {className: layout.stageClassName, 'data-stage': ''}, 'Stage'),
        h('div', {className: layout.targetClassName}, h(TargetLayout, {compact: false, render: () => h('div', {className: 'target-pane'},
            h(SpritePropertiesSection, {inEditor: true, fallback: null, children: null}), h(SpriteList))}))))
});
ReactDOM.createRoot(document.getElementById('root')!).render(h(params.has('standard') ? StandardExample : App));
