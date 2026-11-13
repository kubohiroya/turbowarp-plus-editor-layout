import {createLayout, createSplitter, splitAxis} from './index.ts';
import {createTargetList} from './targets.ts';
import type {DrawerView, DrawerViews} from './drawer-views.ts';
import {availableDrawerViews, createDrawerViewBar, drawerLabel, drawerPinIcon, hasDrawerBar, readDrawerView, writeDrawerView} from './drawer-views.ts';
import {attachStageDrawerDrag} from './stage-drawer-drag.ts';
import type {StageDrawerLayout, StageDrawerPosition} from './workspace-layout.ts';

export type {DrawerMenu, DrawerMenuRenderProps, DrawerRenderProps, DrawerView, DrawerViewId, DrawerViews,
    HostDrawerViewId} from './drawer-views.ts';

const isJapanese = locale => /^ja(?:-|$)/i.test(locale);
const singleColumnTargetWidth = 108;
// Views other than the sprite list show file names and commit subjects, so the drawer opens wider for them.
const drawerViewWidth = 300;
const minimumDrawerViewWidth = 160;
const minimumStandardEditor = 380;

type DrawerPanel = (props: {
    id: DrawerView['id'];
    title: string;
    locale: string;
    dockRequest: number;
    renderHeading(undock: import('react').ReactNode): import('react').ReactNode;
    renderContent(detached: boolean): import('react').ReactNode;
}) => import('react').ReactNode;

export function createStandardLayout(React, {styles, targetStyles, context, LayoutMenu, DrawerPanel = undefined as DrawerPanel | undefined}) {
    const {createElement: element, useContext, useLayoutEffect, useRef, useState} = React;
    const SplitLayout = createLayout(React);
    const Splitter = createSplitter(React);
    const targets = createTargetList(React, targetStyles);
    const DrawerViewBar = createDrawerViewBar(React, styles);
    const targetSearch = React.createContext('');
    const targetTools = React.createContext(null);

    function StandardLayout({
        enabled, splitter, windowLayout, stageActionEnabled, stageDrawer = false,
        onPaletteModeChange, windowTools, Container, render, drawerViews = undefined as DrawerViews | undefined,
        stageDrawerLayout = undefined as StageDrawerLayout | undefined,
        updateStageDrawer = undefined as ((patch: Partial<StageDrawerLayout>) => void) | undefined, ...props
    }) {
        const [showUndock, setShowUndock] = useState(false);
        const [targetsPinned, setTargetsPinned] = useState(true);
        const [showStage, setShowStage] = useState(true);
        const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
        const [localStageDrawerPinned, setLocalStageDrawerPinned] = useState(true);
        const [size, setSize] = useState(null);
        const [targetRatio, setTargetRatio] = useState(null);
        const [viewRatio, setViewRatio] = useState(null);
        const [preferredStageWidth, setPreferredStageWidth] = useState(null);
        const [stageActionMount, setStageActionMount] = useState(null);
        const [preferredDrawerView, setPreferredDrawerView] = useState(() => readDrawerView(props.storage, props.storageKey));
        const hostDrawerViews = availableDrawerViews(drawerViews);
        // A view saved earlier comes back once the host supplies it again.
        const drawerView = hostDrawerViews.some(view => view.id === preferredDrawerView) ? preferredDrawerView : 'sprites';
        const selectDrawerView = React.useCallback(view => {
            setPreferredDrawerView(view);
            writeDrawerView(props.storage, props.storageKey, view);
        }, [props.storage, props.storageKey]);
        const body = useRef(null);
        const plusLayout = enabled && !props.fullscreen;
        const reportDrawerSelection = drawerViews?.onSelectionChange;
        useLayoutEffect(() => {
            reportDrawerSelection?.(plusLayout ? drawerView : 'sprites');
            return () => reportDrawerSelection?.('sprites');
        }, [reportDrawerSelection, plusLayout, drawerView]);
        const stageHidden = plusLayout && !showStage;
        const stageDrawerPinned = updateStageDrawer ? stageDrawerLayout?.pinned !== false : localStageDrawerPinned;
        const setStageDrawerPinned = (pinned: boolean) => {
            if (updateStageDrawer) updateStageDrawer({pinned});
            else setLocalStageDrawerPinned(pinned);
        };
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
        // The sprite list and the other views keep their own widths, so widening one leaves the other as it was.
        const wideDrawer = plusLayout && drawerView !== 'sprites';
        const targetSplit = plusLayout && splitter && size ? (wideDrawer ?
            splitAxis(bodyWidth, viewRatio, drawerViewWidth, minimumDrawerViewWidth, minimumStandardEditor) :
            splitAxis(bodyWidth, targetRatio, singleColumnTargetWidth, singleColumnTargetWidth, minimumStandardEditor)
        ) : null;
        const fixedDrawerWidth = Math.max(singleColumnTargetWidth, Math.min(drawerViewWidth, Math.floor(bodyWidth / 2)));
        const resizable = targetSplit && targetSplit.maximum > targetSplit.minimum;
        const editorSpace = targetsPinned ?
            (targetSplit?.second ?? bodyWidth - (wideDrawer ? fixedDrawerWidth : singleColumnTargetWidth)) : bodyWidth;
        const maximumStageWidth = Math.max(1, Math.floor(Math.min(editorSpace - 24,
            stageDrawer ? (size?.viewportWidth ?? bodyWidth) - 12 : Infinity,
            ((size?.height ?? 640) - 112) * props.stageAspect)));
        const defaultStageWidth = Math.min(maximumStageWidth, Math.floor(Math.min(props.defaultStageWidth, 360, bodyWidth / 2)));
        const minimumStageWidth = Math.min(defaultStageWidth, 280);
        const preferredWidth = stageDrawer && updateStageDrawer ? stageDrawerLayout?.width : preferredStageWidth;
        const resizeStage = stageDrawer && updateStageDrawer ?
            (width: number | undefined) => updateStageDrawer({width}) : setPreferredStageWidth;
        const stageWidth = Math.max(minimumStageWidth, Math.min(maximumStageWidth, preferredWidth ?? defaultStageWidth));
        const stageResize = plusLayout && maximumStageWidth > minimumStageWidth ?
            {minimum: minimumStageWidth, maximum: maximumStageWidth, resize: resizeStage} : null;

        useLayoutEffect(() => {
            if (enabled) onPaletteModeChange?.(true);
        }, [enabled, onPaletteModeChange]);

        useLayoutEffect(() => {
            const node = body.current;
            const Observer = node?.ownerDocument.defaultView.ResizeObserver;
            if (!Observer) return;
            const measure = () => {
                const {clientWidth: width, clientHeight: height} = node;
                const viewportWidth = node.ownerDocument.documentElement.clientWidth;
                setSize(previous => previous?.width === width && previous.height === height &&
                    previous.viewportWidth === viewportWidth ? previous : {width, height, viewportWidth});
            };
            const observer = new Observer(measure);
            measure();
            observer.observe(node);
            const view = node.ownerDocument.defaultView;
            if (stageDrawer) view.addEventListener('resize', measure);
            return () => {
                observer.disconnect();
                if (stageDrawer) view.removeEventListener('resize', measure);
            };
        }, [stageDrawer]);

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
                '--plus-stage-overlap': showStage && !stageDrawer ? stageOverlap : '0px',
                '--plus-stage-tab-inset': stageOverlaps ? stageOverlap : '3rem'
            };
            if (resizable) {
                bodyStyle['--plus-target-width'] = `${targetSplit.first}px`;
                bodyStyle['--plus-target-divider-width'] = `${size.width - targetSplit.available}px`;
            } else if (wideDrawer) {
                bodyStyle['--plus-target-width'] = `${fixedDrawerWidth}px`;
            }
            // The target list is on the physical left in both text directions.
            const columnSplitter = targetsPinned && resizable ? element(Splitter, {
                axis: 'columns', split: targetSplit,
                label: wideDrawer ? (japanese ? 'ドロワーと編集領域の幅' : 'Drawer and editor width') :
                    japanese ? 'スプライト一覧と編集領域の幅' : 'Sprite list and editor width',
                className: `${styles.separator} ${styles.standardSeparator}`,
                onChange: wideDrawer ? setViewRatio : setTargetRatio,
                onReset: () => (wideDrawer ? setViewRatio : setTargetRatio)(null)
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
                handleStagePreset: () => resizeStage(undefined),
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
            stageDrawer: plusLayout && stageDrawer, stageDrawerPinned, setStageDrawerPinned, setStageDrawerOpen,
            locale: props.locale,
            drawerViews, drawerView, selectDrawerView
        }},
            Container ? element(Container, {locale: props.locale}, layout) : layout);
    }

    function EdgeDrawer({edge, label, pinned = false, onOpenChange, portalContent = false, holdOpenSelector = '',
        focusPanelRef = undefined, closePanelRef = undefined, focusBoundary = undefined, showTrigger = true,
        movableStage = false, available = true, keepOpenOnBlur = false,
        stageDrawerLayout = undefined as StageDrawerLayout | undefined,
        updateStageDrawer = undefined as ((patch: Partial<StageDrawerLayout>) => void) | undefined, children}) {
        const [hovered, setHovered] = useState(false);
        const [localEngaged, setLocalEngaged] = useState(false);
        const [heldOpen, setHeldOpen] = useState(false);
        const drawer = useRef(null);
        const trigger = useRef(null);
        const panel = useRef(null);
        const opened = useRef(false);
        const stageDrag = useRef(null);
        const engaged = updateStageDrawer ? Boolean(stageDrawerLayout?.open) : localEngaged;
        const setEngaged = React.useCallback((engaged: boolean) => {
            if (updateStageDrawer) updateStageDrawer({open: engaged, ...(engaged && {selected: true})});
            else setLocalEngaged(engaged);
        }, [updateStageDrawer]);
        const selected = updateStageDrawer ? Boolean(stageDrawerLayout?.selected) : opened.current;
        const open = available && (pinned || engaged || heldOpen ||
            (hovered && (!updateStageDrawer || showTrigger || selected)));
        const stageTrigger = movableStage && available && (showTrigger || selected);

        useLayoutEffect(() => {
            if (open) opened.current = true;
            if (!available) {
                setHovered(false);
                setLocalEngaged(false);
            }
        }, [open, available]);

        useLayoutEffect(() => {
            if (!movableStage) return;
            const node = drawer.current as HTMLElement;
            const stage = node.closest<HTMLElement>(`.${styles.stageDrawer}`);
            const editor = stage?.closest<HTMLElement>(`.${styles.standardBody}`);
            if (!editor || !node.ownerDocument.defaultView?.ResizeObserver) return;
            const controller = attachStageDrawerDrag(node, stage, editor, () => panel.current.focus({preventScroll: true}),
                (position: StageDrawerPosition) => updateStageDrawer?.({position}));
            stageDrag.current = controller;
            return () => {
                stageDrag.current = null;
                controller.dispose();
            };
        }, [movableStage, updateStageDrawer]);
        useLayoutEffect(() => {
            stageDrag.current?.setPosition(stageDrawerLayout?.position);
        }, [movableStage, stageDrawerLayout?.position, updateStageDrawer]);

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
            if (movableStage && !showTrigger && !open) return;
            if (event.pointerType === 'mouse') setHovered(true);
        };
        const leave = () => setHovered(false);
        const focus = (event: FocusEvent) => {
            if (panel.current.contains(event.target as Node)) setEngaged(true);
        };
        const blur = (event: FocusEvent) => {
            if (keepOpenOnBlur) return;
            const target = event.relatedTarget as Node;
            const source = event.target as HTMLButtonElement;
            // Opening the stage disables the launcher before focus moves into the drawer.
            if (!target && source.disabled && focusBoundary?.contains(source)) return;
            if (!drawer.current.contains(target) && !focusBoundary?.contains(target)) setEngaged(false);
        };

        const focusPanel = () => {
            if (!available) return;
            setEngaged(true);
            const frame = drawer.current.ownerDocument.defaultView;
            frame.requestAnimationFrame(() => {
                if (panel.current && !panel.current.hidden) panel.current.focus({preventScroll: true});
            });
        };
        useLayoutEffect(() => {
            if (!focusPanelRef) return;
            focusPanelRef.current = focusPanel;
            return () => {focusPanelRef.current = null;};
        }, [focusPanelRef, available, setEngaged]);

        const closePanel = React.useCallback(() => {
            setHovered(false);
            setEngaged(false);
            const button = (showTrigger ? trigger.current : focusBoundary?.querySelector('button')) as HTMLButtonElement | undefined;
            if (button?.disabled) {
                button.ownerDocument.defaultView?.requestAnimationFrame(() => button.focus({preventScroll: true}));
            } else button?.focus({preventScroll: true});
        }, [focusBoundary, showTrigger, setEngaged]);
        useLayoutEffect(() => {
            if (!closePanelRef || !open) return;
            closePanelRef.current = closePanel;
            return () => {closePanelRef.current = null;};
        }, [closePanelRef, closePanel, open]);

        const closeOnEscape = event => {
            if (event.key !== 'Escape' || pinned || heldOpen || !open || event.defaultPrevented ||
                (movableStage && (event.target as Element).closest('[role="menu"]'))) return;
            closePanel();
            event.stopPropagation();
        };
        useLayoutEffect(() => {
            if (!focusBoundary) return;
            focusBoundary.addEventListener('focusout', blur);
            return () => focusBoundary.removeEventListener('focusout', blur);
        }, [focusBoundary, keepOpenOnBlur, setEngaged]);

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
        }, [portalContent, focusBoundary, open, showTrigger, movableStage, keepOpenOnBlur, setEngaged]);

        useLayoutEffect(() => {
            if (!movableStage || keepOpenOnBlur || !open) return;
            const node = drawer.current as HTMLElement;
            const dismiss = (event: PointerEvent) => {
                const target = event.target as Node;
                if (node.contains(target) || focusBoundary?.contains(target)) return;
                setHovered(false);
                setEngaged(false);
            };
            // The restored drawer may be open without having received focus.
            node.ownerDocument.addEventListener('pointerdown', dismiss, true);
            return () => node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
        }, [movableStage, keepOpenOnBlur, open, focusBoundary, setEngaged]);

        useLayoutEffect(() => {
            if (!portalContent || !movableStage || !open) return;
            const node = drawer.current as HTMLElement;
            node.addEventListener('keydown', closeOnEscape);
            return () => node.removeEventListener('keydown', closeOnEscape);
        }, [portalContent, movableStage, open, heldOpen, pinned, closePanel]);

        return element('div', {
            className: styles.edgeDrawer,
            ref: drawer,
            'data-edge': edge,
            'data-pinned': pinned || undefined,
            'data-movable-stage': movableStage || undefined,
            'data-stage-drawer-open': movableStage && open || undefined,
            'data-stage-drawer-unavailable': movableStage && !available || undefined,
            ...(!portalContent && {onPointerEnter: enter, onPointerLeave: leave, onFocus: focus, onBlur: blur}),
            onKeyDown: portalContent && movableStage ? undefined : closeOnEscape
        },
        (movableStage ? stageTrigger : showTrigger) && element('button', {
            type: 'button',
            className: styles.edgeTrigger,
            hidden: pinned,
            'aria-label': label,
            'aria-expanded': open,
            'data-stage-drawer-trigger': movableStage || undefined,
            'data-stage-drawer-trigger-collapsed': movableStage && !showTrigger || undefined,
            ref: trigger,
            onClick: focusPanel
        }, movableStage ? null : {left: '›', right: '‹', bottom: '⌃'}[edge]),
        element('div', {
            className: styles.edgePanel, ref: panel, tabIndex: -1,
            hidden: !movableStage && !open,
            'aria-hidden': movableStage && !open || undefined,
            inert: movableStage && !open ? '' : undefined
        }, children));
    }

    function TargetLayout({compact, render}) {
        const {plusLayout, targetsPinned, locale, drawerViews, drawerView = 'sprites', selectDrawerView} = useContext(context);
        const tools = useState(null);
        const focusDrawer = useRef(null);
        const [reveal, setReveal] = useState(null as {id: DrawerView['id']; request: number} | null);
        useLayoutEffect(() => {
            if (!plusLayout) return;
            return drawerViews?.registerReveal?.(id => {
                selectDrawerView(id);
                setReveal(previous => ({id, request: (previous?.request ?? 0) + 1}));
                focusDrawer.current?.();
            });
        }, [plusLayout, drawerViews, selectDrawerView]);
        const panel = render(plusLayout || compact);
        if (!plusLayout) return panel;
        const content = element(targetTools.Provider, {value: tools}, panel);
        const drawer = children => element(EdgeDrawer, {
            edge: 'left', pinned: targetsPinned, focusPanelRef: focusDrawer,
            label: isJapanese(locale) ? 'スプライト一覧を展開' : 'Reveal sprite list'
        }, children);
        // Without host views the drawer keeps the sprite list as its only, unwrapped content.
        if (!hasDrawerBar(drawerViews)) return drawer(content);
        const views = availableDrawerViews(drawerViews);
        const active = views.find(view => view.id === drawerView);
        return drawer(element(React.Fragment, null,
            element(DrawerViewBar, {locale, views, agents: drawerViews.agents, selected: active ? active.id : 'sprites',
                onSelect: selectDrawerView}),
            // The GUI's target pane stays mounted, so its file inputs and library keep working while hidden.
            element('div', {className: styles.drawerSprites, hidden: Boolean(active)}, content),
            views.map(view => element(HostDrawerView, {key: view.id, view, locale, active: view === active,
                dockRequest: reveal?.id === view.id ? reveal.request : 0}))));
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

    function DrawerPinButton({label}) {
        const {targetsPinned, setTargetsPinned} = useContext(context);
        return element('button', {type: 'button', className: styles.drawerPin, 'aria-label': label, 'aria-pressed': targetsPinned,
            title: label, onClick: () => setTargetsPinned(value => !value)},
        drawerPinIcon(element, targetsPinned));
    }

    function useDrawerTools(searchLabel?: string) {
        const [searching, setSearching] = useState(false);
        const [query, setQuery] = useState('');
        const searchButton = useRef(null);
        const searchInput = useRef(null);
        useLayoutEffect(() => {
            if (searching) searchInput.current?.focus({preventScroll: true});
        }, [searching]);
        const closeSearch = () => {
            setSearching(false);
            setQuery('');
            searchButton.current?.focus();
        };
        const render = ({label, pinLabel, openAction, tools}: {
            label: string; pinLabel?: string; openAction?: import('react').ReactNode; tools?: import('react').ReactNode;
        }) => element(React.Fragment, null,
            element('div', {className: styles.targetListTools, role: 'group', 'aria-label': label},
                tools,
                searchLabel && element('button', {type: 'button', ref: searchButton, 'aria-label': searchLabel,
                    'aria-expanded': searching, title: searchLabel, onClick: () => searching ? closeSearch() : setSearching(true)},
                element('svg', {'aria-hidden': true, width: 14, height: 14, viewBox: '0 0 16 16',
                    fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round'},
                element('circle', {cx: 6.5, cy: 6.5, r: 4}), element('path', {d: 'm9.5 9.5 4 4'}))),
                pinLabel && element(DrawerPinButton, {label: pinLabel}),
                openAction),
            searching && element('input', {type: 'search', className: styles.targetListSearch,
                'aria-label': searchLabel, ref: searchInput, placeholder: searchLabel, value: query,
                onChange: event => setQuery(event.currentTarget.value),
                onKeyDown: event => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        closeSearch();
                    }
                }}));
        return {query, render};
    }

    function HostDrawerView({view, locale, active, dockRequest}: {
        view: DrawerView; locale: string; active: boolean; dockRequest: number;
    }) {
        const title = view.label ?? drawerLabel(view.id, locale);
        const japanese = isJapanese(locale);
        const label = japanese ? `${title}の操作` : `${title} tools`;
        const {query, render} = useDrawerTools(view.searchLabel?.(locale));
        const renderHeading = openAction => render({
            label,
            pinLabel: japanese ? 'このパネルを固定表示' : 'Pin this panel',
            openAction,
            tools: view.tools?.({locale, query})
        });
        const renderContent = detached => (active || detached) && element('div', {
            className: styles.drawerViewContent, 'data-drawer-content': view.id
        },
        detached && view.searchLabel && render({label}),
        view.render({locale, query}));
        if (!DrawerPanel && !active) return null;
        return element('div', {className: styles.drawerHostView, hidden: !active}, DrawerPanel ?
            element(DrawerPanel, {id: view.id, title, locale, dockRequest, renderHeading, renderContent}) :
            element(React.Fragment, null, renderHeading(null), renderContent(false)));
    }

    function useSpriteListTools() {
        const {locale} = useContext(context);
        const [mount] = useContext(targetTools) ?? [];
        const japanese = isJapanese(locale);
        const {query, render} = useDrawerTools(japanese ? 'スプライトを検索' : 'Search sprites');
        return {
            mount, query,
            renderTools: openAction => render({
                label: japanese ? 'スプライト一覧の操作' : 'Sprite list tools',
                pinLabel: japanese ? 'スプライト一覧を固定表示' : 'Pin sprite list',
                openAction
            }),
            title: japanese ? 'スプライト一覧' : 'Sprite list',
            openLabel: japanese ? 'アンドック' : 'Undock sprite list'
        };
    }

    return {StandardLayout, EdgeDrawer, TargetLayout, useSpriteListTools, TargetSearchProvider: targetSearch.Provider, SpriteGrid, SpriteListContent, BackdropTile: targets.BackdropTile, BackdropActions, SpritePropertiesSection};
}
