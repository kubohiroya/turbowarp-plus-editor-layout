import {createLayout, createSplitter, splitAxis} from './index.ts';
import {createTargetList} from './targets.ts';

const isJapanese = locale => /^ja(?:-|$)/i.test(locale);
const singleColumnTargetWidth = 108;
const minimumStandardEditor = 380;

export function createStandardLayout(React, {styles, targetStyles, context, LayoutMenu}) {
    const {createElement: element, useContext, useLayoutEffect, useRef, useState} = React;
    const SplitLayout = createLayout(React);
    const Splitter = createSplitter(React);
    const targets = createTargetList(React, targetStyles);
    const targetSearch = React.createContext('');
    const targetTools = React.createContext(null);

    function StandardLayout({
        enabled, splitter, windowLayout, stageActionEnabled, stageDrawer = false,
        onPaletteModeChange, windowTools, Container, render, ...props
    }) {
        const [showUndock, setShowUndock] = useState(false);
        const [targetsPinned, setTargetsPinned] = useState(true);
        const [showStage, setShowStage] = useState(true);
        const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
        const [size, setSize] = useState(null);
        const [targetRatio, setTargetRatio] = useState(null);
        const [preferredStageWidth, setPreferredStageWidth] = useState(null);
        const [stageActionMount, setStageActionMount] = useState(null);
        const body = useRef(null);
        const plusLayout = enabled && !props.fullscreen;
        const stageHidden = plusLayout && !showStage;
        const japanese = isJapanese(props.locale);
        const undockLabel = japanese ? 'アンドックボタンを表示' : 'Show undock buttons';
        const layoutMenuLabel = japanese ? '配置メニュー' : 'Layout options';
        const toggleUndock = () => setShowUndock(value => !value);
        const layoutMenu = windowLayout && (LayoutMenu ? element(LayoutMenu, {
            label: layoutMenuLabel, undockLabel, showUndock, onToggle: toggleUndock
        }) : element('details', {className: styles.layoutMenu},
            element('summary', {'aria-label': layoutMenuLabel}, '⋯'),
            element('button', {
                'aria-pressed': showUndock, type: 'button',
                onClick: event => {
                    toggleUndock();
                    const menu = event.currentTarget.parentElement;
                    menu.open = false;
                    menu.querySelector('summary').focus();
                }
            }, undockLabel)));
        const stageTools = stageActionEnabled &&
            element('span', {className: styles.stageActionSlot, ref: setStageActionMount});
        const bodyWidth = size?.width ?? 1024;
        const targetSplit = plusLayout && splitter && size ? splitAxis(
            bodyWidth, targetRatio, singleColumnTargetWidth, singleColumnTargetWidth, minimumStandardEditor
        ) : null;
        const resizable = targetSplit && targetSplit.maximum > targetSplit.minimum;
        const editorSpace = targetsPinned ? (targetSplit?.second ?? bodyWidth - singleColumnTargetWidth) : bodyWidth;
        const maximumStageWidth = Math.max(1, Math.floor(Math.min(editorSpace - 24,
            ((size?.height ?? 640) - 112) * props.stageAspect)));
        const defaultStageWidth = Math.min(maximumStageWidth, Math.floor(Math.min(props.defaultStageWidth, 360, bodyWidth / 2)));
        const minimumStageWidth = Math.min(defaultStageWidth, 280);
        const stageWidth = Math.max(minimumStageWidth, Math.min(maximumStageWidth, preferredStageWidth ?? defaultStageWidth));
        const stageResize = plusLayout && maximumStageWidth > minimumStageWidth ?
            {minimum: minimumStageWidth, maximum: maximumStageWidth, resize: setPreferredStageWidth} : null;

        useLayoutEffect(() => {
            if (enabled) onPaletteModeChange?.(true);
        }, [enabled, onPaletteModeChange]);

        useLayoutEffect(() => {
            const node = body.current;
            const Observer = node?.ownerDocument.defaultView.ResizeObserver;
            if (!Observer) return;
            const measure = () => {
                const {clientWidth: width, clientHeight: height} = node;
                setSize(previous => previous?.width === width && previous.height === height ? previous : {width, height});
            };
            const observer = new Observer(measure);
            measure();
            observer.observe(node);
            return () => observer.disconnect();
        }, []);

        const renderEditorTabRow = (tabs, action) => element('div', {className: styles.tabRow}, tabs,
            (layoutMenu || windowTools) && element('div', {className: styles.layoutTools}, layoutMenu, windowTools), action);

        const applyStandardLayout = layout => {
            if (!enabled) return {...layout, stageClassName: styles.stagePanel,
                renderEditorTabRow: windowLayout ? renderEditorTabRow : undefined};
            const shared = {
                ...layout,
                stageClassName: styles.stagePanel,
                renderEditorTabRow,
                observe: node => {
                    layout.observe(node);
                    body.current = node;
                }
            };
            if (!plusLayout) return shared;
            const stageOverlap = `${stageWidth + 20}px`;
            const stageOverlaps = showStage && (!stageDrawer || stageDrawerOpen);
            const bodyStyle = {
                display: 'grid',
                '--plus-stage-overlap': stageOverlaps ? stageOverlap : '0px',
                '--plus-stage-tab-inset': stageOverlaps ? stageOverlap : '3rem'
            };
            if (resizable) {
                bodyStyle['--plus-target-width'] = `${targetSplit.first}px`;
                bodyStyle['--plus-target-divider-width'] = `${size.width - targetSplit.available}px`;
            }
            // The target list is on the physical left in both text directions.
            const columnSplitter = targetsPinned && resizable ? element(Splitter, {
                axis: 'columns', split: targetSplit,
                label: japanese ? 'スプライト一覧と編集領域の幅' : 'Sprite list and editor width',
                className: `${styles.separator} ${styles.standardSeparator}`,
                onChange: setTargetRatio, onReset: () => setTargetRatio(null)
            }) : null;
            return {
                ...shared,
                bodyClassName: styles.standardBody,
                bodyStyle,
                columnSplitter,
                editorStyle: {gridArea: 'editor', minWidth: 0, minHeight: 0},
                stageColumnStyle: {display: 'contents'},
                stageClassName: `${styles.stagePanel} ${styles.floatingStage}${stageDrawer ? ` ${styles.stageDrawer}` : ''}${stageHidden ? ` ${styles.stageHidden}` : ''}`,
                targetClassName: targetsPinned ? styles.standardTargets :
                    `${styles.standardTargets} ${styles.retractedTargets}`,
                stageDisplayWidth: stageWidth,
                handleStagePreset: () => setPreferredStageWidth(null),
                editorWidth: targetsPinned && resizable ? targetSplit.second : size?.width
            };
        };

        const layout = element(SplitLayout, {
            ...props,
            enabled: splitter && !plusLayout,
            labels: {
                columns: japanese ? '編集領域とステージ列の幅' : 'Editor and stage column width',
                rows: japanese ? 'ステージと対象領域の高さ' : 'Stage and target pane height'
            },
            minimumEditor: 500,
            minimumStageColumn: 350,
            minimumStageRow: 135,
            minimumTargets: 175,
            separatorClassName: styles.separator,
            stageTools,
            render: slots => render(applyStandardLayout(slots), showUndock)
        });
        return element(context.Provider, {value: {
            showUndock, plusLayout, targetsPinned, setTargetsPinned, stageHidden, setStageVisible: setShowStage, stageResize, stageActionMount,
            stageDrawer: plusLayout && stageDrawer, setStageDrawerOpen, locale: props.locale
        }},
            Container ? element(Container, {locale: props.locale}, layout) : layout);
    }

    function EdgeDrawer({edge, label, pinned = false, onOpenChange, portalContent = false, holdOpenSelector = '', children}) {
        const [hovered, setHovered] = useState(false);
        const [engaged, setEngaged] = useState(false);
        const [heldOpen, setHeldOpen] = useState(false);
        const drawer = useRef(null);
        const trigger = useRef(null);
        const panel = useRef(null);
        const open = pinned || hovered || engaged || heldOpen;

        useLayoutEffect(() => {
            if (!holdOpenSelector) return;
            const node = panel.current as HTMLElement;
            const view = node.ownerDocument.defaultView;
            if (!view) return;
            const update = () => setHeldOpen(Array.from(node.querySelectorAll(holdOpenSelector)).some(element =>
                !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' &&
                view.getComputedStyle(element).display !== 'none'
            ));
            const observer = new view.MutationObserver(records => {
                if (records.some(record => record.type === 'childList' ||
                    (record.target as Element).matches(holdOpenSelector))) update();
            });
            observer.observe(node, {subtree: true, childList: true, attributes: true,
                attributeFilter: ['style', 'hidden', 'aria-hidden']});
            update();
            return () => observer.disconnect();
        }, [holdOpenSelector]);

        useLayoutEffect(() => {onOpenChange?.(open);}, [open, onOpenChange]);

        const enter = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') setHovered(true);
        };
        const leave = () => setHovered(false);
        const focus = (event: FocusEvent) => {
            if (panel.current.contains(event.target as Node)) setEngaged(true);
        };
        const blur = (event: FocusEvent) => {
            if (!drawer.current.contains(event.relatedTarget as Node)) setEngaged(false);
        };

        useLayoutEffect(() => {
            if (!portalContent) return;
            const node = drawer.current as HTMLElement;
            // Use the DOM ancestry for a surface rendered through a portal.
            node.addEventListener('pointerenter', enter);
            node.addEventListener('pointerleave', leave);
            node.addEventListener('focusin', focus);
            node.addEventListener('focusout', blur);
            return () => {
                node.removeEventListener('pointerenter', enter);
                node.removeEventListener('pointerleave', leave);
                node.removeEventListener('focusin', focus);
                node.removeEventListener('focusout', blur);
            };
        }, [portalContent]);

        return element('div', {
            className: styles.edgeDrawer,
            ref: drawer,
            'data-edge': edge,
            'data-pinned': pinned || undefined,
            ...(!portalContent && {onPointerEnter: enter, onPointerLeave: leave, onFocus: focus, onBlur: blur}),
            onKeyDown: event => {
                if (event.key !== 'Escape' || pinned || heldOpen || !open || event.defaultPrevented) return;
                setHovered(false);
                setEngaged(false);
                trigger.current.focus();
                event.stopPropagation();
            }
        },
        element('button', {
            type: 'button',
            className: styles.edgeTrigger,
            hidden: pinned,
            'aria-label': label,
            'aria-expanded': open,
            ref: trigger,
            onClick: () => {
                setEngaged(true);
                const frame = trigger.current.ownerDocument.defaultView;
                frame.requestAnimationFrame(() => {
                    if (panel.current && !panel.current.hidden) panel.current.focus({preventScroll: true});
                });
            }
        }, {left: '›', right: '‹', bottom: '⌃'}[edge]),
        element('div', {className: styles.edgePanel, ref: panel, tabIndex: -1, hidden: !open}, children));
    }

    function TargetLayout({compact, render}) {
        const {plusLayout, targetsPinned, locale} = useContext(context);
        const tools = useState(null);
        const panel = render(plusLayout || compact);
        return plusLayout ? element(EdgeDrawer, {
            edge: 'left', pinned: targetsPinned,
            label: isJapanese(locale) ? 'スプライト一覧を展開' : 'Reveal sprite list'
        }, element(targetTools.Provider, {value: tools}, panel)) : panel;
    }

    function SpriteGrid(props) {
        const {plusLayout} = useContext(context);
        return element(targets.SpriteGrid, {...props, query: useContext(targetSearch), standard: plusLayout});
    }

    function SpriteListContent({children}) {
        const {locale} = useContext(context);
        const title = isJapanese(locale) ? 'スプライトを追加する' : /^en(?:-|$)/i.test(locale) ? 'Add a Sprite' : null;
        const content = title ? React.Children.map(children, child => {
            // The pinned GUI passes its add menu as a direct child of the list panel.
            if (!React.isValidElement(child) || !child.props.className?.startsWith('sprite-selector_add-button_')) {
                return child;
            }
            return React.cloneElement(child, {title});
        }) : children;
        return element('div', {className: styles.targetListContent}, content);
    }

    function BackdropActions({compact, buttons, children}) {
        const {plusLayout, locale} = useContext(context);
        if (!plusLayout && !compact) return children;
        const unique = buttons.filter(({title}, index) => buttons.findIndex(button => button.title === title) === index);
        return element(targets.BackdropFooter, {buttons: unique, label: isJapanese(locale) ? '背景を追加' : 'Add a backdrop'});
    }

    function SpritePropertiesSection({fallback, children, inEditor = false}) {
        const {plusLayout, locale} = useContext(context);
        const [expanded, setExpanded] = useState(false);
        const tools = useContext(targetTools);
        return plusLayout ? element('div', {className: styles.spriteProperties},
            !inEditor &&
                element('button', {
                    type: 'button', className: styles.spritePropertiesToggle, 'aria-expanded': expanded,
                    onClick: () => setExpanded(open => !open)
                }, isJapanese(locale) ? 'スプライト' : 'Sprite'),
            element('div', {ref: tools?.[1]}),
            !inEditor && element('div', {className: styles.spritePropertiesContent, hidden: !expanded}, children)
        ) : fallback;
    }

    function useSpriteListTools() {
        const {locale, targetsPinned, setTargetsPinned} = useContext(context);
        const [mount] = useContext(targetTools) ?? [];
        const [searching, setSearching] = useState(false);
        const [query, setQuery] = useState('');
        const searchButton = useRef(null);
        const searchInput = useRef(null);
        const japanese = isJapanese(locale);
        const pinLabel = japanese ? 'スプライト一覧を固定表示' : 'Pin sprite list';
        const searchLabel = japanese ? 'スプライトを検索' : 'Search sprites';
        useLayoutEffect(() => {
            if (searching) searchInput.current?.focus({preventScroll: true});
        }, [searching]);
        const closeSearch = () => {
            setSearching(false);
            setQuery('');
            searchButton.current?.focus();
        };
        const renderTools = openAction => element(React.Fragment, null,
            element('div', {className: styles.targetListTools, role: 'group',
                'aria-label': japanese ? 'スプライト一覧の操作' : 'Sprite list tools'},
            element('button', {type: 'button', ref: searchButton, 'aria-label': searchLabel, 'aria-expanded': searching,
                title: searchLabel, onClick: () => searching ? closeSearch() : setSearching(true)},
            element('svg', {'aria-hidden': true, width: 14, height: 14, viewBox: '0 0 16 16',
                fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round'},
            element('circle', {cx: 6.5, cy: 6.5, r: 4}), element('path', {d: 'm9.5 9.5 4 4'}))),
            element('button', {type: 'button', className: styles.drawerPin, 'aria-label': pinLabel, 'aria-pressed': targetsPinned,
                title: pinLabel, onClick: () => setTargetsPinned(value => !value)},
            element('svg', {'aria-hidden': true, width: 14, height: 14, viewBox: '0 0 16 16',
                fill: targetsPinned ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round'},
            element('path', {d: 'M9 2 14 7 12 8l-2 3-5-5 3-2 1-2Z'}), element('path', {d: 'm7.5 8.5-4 4'}),
            !targetsPinned && element('path', {d: 'M2 2l12 12', strokeLinecap: 'round'}))),
            openAction),
            searching && element('input', {type: 'search', className: styles.targetListSearch, 'aria-label': searchLabel,
                ref: searchInput, placeholder: japanese ? '名前' : 'Name', value: query,
                onChange: event => setQuery(event.currentTarget.value),
                onKeyDown: event => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        closeSearch();
                    }
                }}));
        return {
            mount, query, renderTools,
            title: japanese ? 'スプライト一覧' : 'Sprite list',
            openLabel: japanese ? 'アンドック' : 'Undock sprite list'
        };
    }

    return {StandardLayout, EdgeDrawer, TargetLayout, useSpriteListTools, TargetSearchProvider: targetSearch.Provider, SpriteGrid, SpriteListContent, BackdropTile: targets.BackdropTile, BackdropActions, SpritePropertiesSection};
}
