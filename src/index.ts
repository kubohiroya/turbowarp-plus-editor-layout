export {attachExternalMonitorDrag} from './monitor-drag.ts';
export {attachStageInput} from './stage-input.ts';
export {panelLayoutIconPath} from './sprite-layout-menu.ts';

type Axis = 'columns' | 'rows';
type Ratios = Record<Axis, number | null>;
type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

const separatorSize = 8;
const keyboardStep = 16;

export function splitAxis (length: number, ratio: number | null, fallback: number, minimumFirst: number, minimumSecond: number) {
    const available = Math.max(0, Math.round(length) - separatorSize);
    const minimum = Math.min(minimumFirst, available);
    const maximum = Math.max(minimum, available - minimumSecond);
    const desired = ratio === null ? fallback : available * ratio;
    const first = Math.round(Math.min(maximum, Math.max(minimum, desired)));
    return {available, minimum, maximum, first, second: available - first};
}

export function readRatios (storage: LayoutStorage | null, key: string): Ratios {
    try {
        const saved = JSON.parse(storage?.getItem(key));
        if (saved?.version === 1) {
            const ratio = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
            return {columns: ratio(saved.columns), rows: ratio(saved.rows)};
        }
    } catch {
        // Storage can be unavailable or contain obsolete data.
    }
    return {columns: null, rows: null};
}

export function writeRatios (storage: LayoutStorage | null, key: string, ratios: Ratios) {
    try {
        storage?.setItem(key, JSON.stringify({version: 1, ...ratios}));
    } catch {
        // Keep the current layout usable when persistence is denied.
    }
}

export function fitStage (columnWidth: number, rowHeight: number, aspect: number, horizontalInset: number, verticalInset: number) {
    return Math.max(1, Math.floor(Math.min(columnWidth - horizontalInset, (rowHeight - verticalInset) * aspect)));
}

export function createSplitter (React) {
    return function Splitter ({axis, split, rtl, label, onChange, onReset, className}) {
        const drag = React.useRef(null);
        const vertical = axis === 'columns';
        const coordinate = event => vertical ? event.clientX : event.clientY;
        const direction = vertical && rtl ? -1 : 1;
        const update = position => {
            if (split.available > 0) {
                const value = Math.max(split.minimum, Math.min(split.maximum, position));
                onChange(value / split.available);
            }
        };
        const onKeyDown = event => {
            const {key} = event;
            const previous = vertical ? 'ArrowLeft' : 'ArrowUp';
            const next = vertical ? 'ArrowRight' : 'ArrowDown';
            if (key === previous) update(split.first - keyboardStep * direction);
            else if (key === next) update(split.first + keyboardStep * direction);
            else if (key === 'Home') update(split.minimum);
            else if (key === 'End') update(split.maximum);
            else if (key === 'Enter') onReset();
            else return;
            event.preventDefault();
            event.stopPropagation();
        };
        const clearDrag = event => {
            if (drag.current?.id === event.pointerId) drag.current = null;
        };

        return React.createElement('div', {
            role: 'separator',
            tabIndex: 0,
            'aria-label': label,
            'aria-orientation': vertical ? 'vertical' : 'horizontal',
            'aria-valuemin': split.minimum,
            'aria-valuemax': split.maximum,
            'aria-valuenow': split.first,
            className,
            style: {
                touchAction: 'none',
                userSelect: 'none',
                cursor: vertical ? 'col-resize' : 'row-resize'
            },
            onKeyDown,
            onDoubleClick: onReset,
            onPointerDown: event => {
                if (event.button !== 0 || drag.current) return;
                drag.current = {id: event.pointerId, start: coordinate(event), first: split.first};
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                event.preventDefault();
            },
            onPointerMove: event => {
                if (drag.current?.id !== event.pointerId) return;
                update(drag.current.first + (coordinate(event) - drag.current.start) * direction);
            },
            onPointerUp: clearDrag,
            onPointerCancel: clearDrag,
            onLostPointerCapture: clearDrag
        });
    };
}

export function createLayout (React) {
    const Splitter = createSplitter(React);

    return function SplitLayout ({
        render, enabled, fullscreen, rtl, labels, separatorClassName, stageTools,
        defaultStageWidth, defaultStageHeight, stageAspect, horizontalInset, verticalInset,
        minimumEditor, minimumStageColumn, minimumStageRow, minimumTargets, storage, storageKey
    }) {
        const [ratios, setRatios] = React.useState(() => readRatios(storage, storageKey));
        const [size, setSize] = React.useState(null);
        const element = React.useRef(null);
        const observe = React.useCallback(node => {
            element.current = node;
        }, []);
        const active = enabled && !fullscreen;
        React.useLayoutEffect(() => {
            const node = element.current;
            const ResizeObserver = node?.ownerDocument.defaultView.ResizeObserver;
            if (!active || !ResizeObserver) return;
            const measure = () => {
                const {clientWidth: width, clientHeight: height} = node;
                setSize(previous => previous?.width === width && previous.height === height ?
                    previous : {width, height});
            };
            measure();
            const observer = new ResizeObserver(measure);
            observer.observe(node);
            return () => observer.disconnect();
        }, [active]);

        const base = {observe, stageTools};
        if (!active || !size ||
            size.width < minimumEditor + separatorSize + minimumStageColumn ||
            size.height < minimumStageRow + separatorSize + minimumTargets) return render(base);

        const columns = splitAxis(size.width, ratios.columns,
            size.width - separatorSize - Math.max(minimumStageColumn, defaultStageWidth + horizontalInset),
            minimumEditor, minimumStageColumn);
        const rows = splitAxis(size.height, ratios.rows, defaultStageHeight + verticalInset,
            minimumStageRow, minimumTargets);
        const save = updated => {
            setRatios(updated);
            writeRatios(storage, storageKey, updated);
        };
        const change = (axis, value) => save({...ratios, [axis]: value});
        const separator = (axis, split) => React.createElement(Splitter, {
            axis, split, rtl,
            label: labels[axis],
            className: separatorClassName,
            onChange: value => change(axis, value),
            onReset: () => change(axis, null)
        });

        return render({
            ...base,
            columnSplitter: separator('columns', columns),
            rowSplitter: separator('rows', rows),
            bodyStyle: {display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${separatorSize}px ${columns.second}px`},
            editorStyle: {minWidth: 0, minHeight: 0},
            stageColumnStyle: {display: 'grid', minWidth: 0, minHeight: 0,
                gridTemplateRows: `${rows.first}px ${separatorSize}px minmax(0, 1fr)`},
            stageDisplayWidth: fitStage(columns.second, rows.first, stageAspect, horizontalInset, verticalInset),
            editorWidth: columns.first,
            handleStagePreset: () => save({columns: null, rows: null})
        });
    };
}

export {createTargetList} from './targets.ts';
export {attachHorizontalWorkspaceZoom, workspaceControlsCorner} from './workspace-zoom.ts';
