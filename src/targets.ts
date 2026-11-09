import {observeTileNameTitles} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/native-tile-title';

const tileHeight = 80;
const minTileWidth = 72;
const gap = 6;
const padding = gap * 2;

export function createTargetList(React, styles) {
    const {createElement: element, useLayoutEffect, useRef, useState} = React;

    function SpriteGrid({className, compact, standard, stageTile, children, query = '', onRename}) {
        const grid = useRef(null);
        const [size, setSize] = useState({width: 0, height: 0, visibleRows: 0});
        useLayoutEffect(() => {
            if (!compact) return;
            const node = grid.current;
            const viewport = node.parentElement;
            const view = node.ownerDocument.defaultView;
            const measure = () => {
                const {clientWidth: width, clientHeight: height} = viewport;
                const {paddingTop, paddingBottom} = view.getComputedStyle(node);
                const verticalPadding = parseFloat(paddingTop) + parseFloat(paddingBottom);
                const visibleRows = Math.floor((height - verticalPadding + gap) / (tileHeight + gap));
                setSize(previous => previous.width === width && previous.height === height &&
                    previous.visibleRows === visibleRows ? previous : {width, height, visibleRows});
            };
            measure();
            const observer = new view.ResizeObserver(measure);
            observer.observe(viewport);
            return () => observer.disconnect();
        }, [compact]);

        useLayoutEffect(() => observeTileNameTitles(grid.current), []);

        useLayoutEffect(() => {
            const name = query.trim().toLocaleLowerCase();
            if (!name) return;
            // Scratch GUI keys sortable tiles by sprite name. Keep their order and drag indices intact.
            let match = -1;
            React.Children.forEach(children, (child, index) => {
                if (match === -1 && child?.key?.toLocaleLowerCase().includes(name)) match = index;
            });
            const tile = grid.current.children[match];
            if (!tile) return;
            const scroll = grid.current.parentElement;
            const {top, bottom} = scroll.getBoundingClientRect();
            const bounds = tile.getBoundingClientRect();
            if (bounds.top < top) scroll.scrollTop += bounds.top - top;
            else if (bounds.bottom > bottom) scroll.scrollTop += bounds.bottom - bottom;
            tile.setAttribute('data-sprite-search-match', '');
            return () => tile.removeAttribute('data-sprite-search-match');
        }, [children, query]);

        const columns = Math.max(1, Math.floor((size.width - padding + gap) / (minTileWidth + gap)));
        const placement = standard || size.width < size.height ? 'bottom-right' :
            (columns >= 2 ? 'top-right' : 'inline');
        const rows = Math.max(size.visibleRows, Math.ceil((React.Children.count(children) + 1) / columns));
        const tiles = onRename ? React.Children.map(children, child => {
            const tile = React.isValidElement(child) && child.props.children;
            if (!React.isValidElement(tile) || !tile.props.id) return child;
            return React.cloneElement(child, {}, React.cloneElement(tile, {onRenameButtonClick: onRename}));
        }) : children;
        return element('div', {
            className: compact ? `${className} ${styles.grid}` : className,
            'data-standard-target-grid': standard || undefined,
            'data-target-columns': compact ? columns : undefined,
            'data-backdrop-placement': compact ? placement : undefined,
            ref: grid,
            style: compact ? {
                '--target-columns': columns,
                '--target-rows-before-last': rows > 1 ? `repeat(${rows - 1}, ${tileHeight}px)` : undefined
            } : undefined
        }, tiles, stageTile && element('div', {className: styles.backdropCell, key: 'stage'}, stageTile));
    }

    function BackdropTile({url, label, selected, highlighted, containerRef, onClick, onMouseEnter, onMouseLeave}) {
        return element('button', {
            type: 'button', className: styles.backdrop, ref: containerRef, 'aria-pressed': selected,
            'data-highlighted': highlighted || undefined, onClick, onMouseEnter, onMouseLeave
        }, url && element('img', {src: url, alt: '', draggable: false}),
        element('span', {className: styles.backdropLabel}, label));
    }

    function BackdropFooter({buttons, label}) {
        return element('div', {className: styles.backdropFooter, role: 'group', 'aria-label': label},
            buttons.map(({title, img, onClick, fileInput, fileAccept, fileChange, fileMultiple}) =>
                element(React.Fragment, {key: title},
                    element('button', {type: 'button', 'aria-label': title, title, onClick},
                        element('img', {src: img, alt: '', draggable: false})),
                    fileInput && element('input', {type: 'file', accept: fileAccept, multiple: fileMultiple,
                        ref: fileInput, onChange: fileChange, hidden: true}))));
    }

    return {SpriteGrid, BackdropTile, BackdropFooter};
}
