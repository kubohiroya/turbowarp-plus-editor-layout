import React from 'react';

export function StageResizeHandle({edge, aspect, width, limits, label, className, drawer = false}) {
    const drag = React.useRef(null);
    const corner = edge === 'corner';
    const horizontal = edge === 'left' || edge === 'right';
    const resize = next => limits.resize(Math.round(Math.max(limits.minimum, Math.min(limits.maximum, next))));
    return React.createElement('div', {
        className,
        'data-stage-resize': edge,
        'data-stage-drawer-resize': drawer || undefined,
        role: corner ? undefined : 'separator',
        'aria-orientation': corner ? undefined : (horizontal ? 'vertical' : 'horizontal'),
        'aria-label': corner ? undefined : label,
        'aria-valuemin': corner ? undefined : limits.minimum,
        'aria-valuemax': corner ? undefined : limits.maximum,
        'aria-valuenow': corner ? undefined : width,
        tabIndex: corner ? undefined : 0,
        title: label,
        onPointerDown: event => {
            if (event.button !== 0 || drag.current) return;
            drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, width};
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
        },
        onPointerMove: event => {
            const start = drag.current;
            if (start?.id !== event.pointerId) return;
            const dx = (event.clientX - start.x) * (edge === 'right' ? 1 : -1);
            const dy = (event.clientY - start.y) * aspect * (edge === 'top' ? -1 : 1);
            const delta = corner ? (Math.abs(dx) >= Math.abs(dy) ? dx : dy) : (horizontal ? dx : dy);
            resize(start.width + delta);
        },
        onLostPointerCapture: () => {drag.current = null;},
        onKeyDown: event => {
            const grow = {left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown'}[edge];
            const shrink = {left: 'ArrowRight', right: 'ArrowLeft', top: 'ArrowDown', bottom: 'ArrowUp'}[edge];
            if (event.key === grow) resize(width + 16);
            else if (event.key === shrink) resize(width - 16);
            else if (event.key === 'Home') resize(limits.minimum);
            else if (event.key === 'End') resize(limits.maximum);
            else return;
            event.preventDefault();
            event.stopPropagation();
        }
    });
}
