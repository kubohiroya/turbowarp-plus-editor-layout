const controls = 'button, input, select, textarea, label, a[href], img, ' +
    '[role="button"], [role="slider"], [role="menu"], [tabindex], [contenteditable]';

type Position = {x: number; y: number};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function attachStageDrawerDrag(drawer: HTMLElement, stage: HTMLElement, editor: HTMLElement, focus: () => void) {
    const document = drawer.ownerDocument;
    const view = document.defaultView;
    let position: Position | undefined;
    let drag: {id: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean} | undefined;
    let resizeDrag: {id: number; edge: string; start: DOMRect; position?: Position} | undefined;

    function bounds() {
        const area = editor.getBoundingClientRect();
        const panel = stage.getBoundingClientRect();
        const left = Math.max(area.left, 0);
        const top = Math.max(area.top, 0);
        return {
            left, top, editorLeft: area.left, editorTop: area.top, panel,
            width: Math.max(0, Math.min(area.right, document.documentElement.clientWidth) - left - panel.width),
            height: Math.max(0, Math.min(area.bottom, document.documentElement.clientHeight) - top - panel.height)
        };
    }

    function place(area = bounds()) {
        const {left, top, editorLeft, editorTop, width, height, panel} = area;
        if (position) {
            if (resizeDrag?.position) {
                const {edge, start, position: original} = resizeDrag;
                // Keep the opposite side of the frame fixed where it can move along the perimeter.
                if (width && original.x > 0 && original.x < 1) {
                    const anchor = edge === 'left' ? start.right - panel.width : start.left;
                    position.x = clamp((anchor - left) / width);
                }
                if (height && original.y > 0 && original.y < 1) {
                    const anchor = edge === 'top' ? start.bottom - panel.height : start.top;
                    position.y = clamp((anchor - top) / height);
                }
            }
            stage.style.setProperty('--plus-stage-drawer-x', `${left - editorLeft + position.x * width}px`);
            stage.style.setProperty('--plus-stage-drawer-y', `${top - editorTop + position.y * height}px`);
            stage.setAttribute('data-stage-drawer-positioned', '');
        }
        const contacts = [
            (position?.x === 0 || !width) && 'left',
            (!position || position.x === 1 || !width) && 'right',
            (position ? position.y === 0 || !height : Math.abs(panel.top - top) < 1) && 'top',
            (position ? position.y === 1 || !height : Math.abs(panel.top - top - height) < 1) && 'bottom'
        ].filter(Boolean);
        stage.setAttribute('data-stage-drawer-contacts', contacts.join(' '));
        stage.setAttribute('data-stage-drawer-edge', String(contacts[0] ?? 'right'));
    }

    function start(event: PointerEvent) {
        if (drag || resizeDrag || event.button !== 0 || !event.isPrimary || event.defaultPrevented) return;
        const target = event.target as Element;
        const resizeEdge = target.closest('[data-stage-drawer-resize]')?.getAttribute('data-stage-resize');
        if (resizeEdge) {
            resizeDrag = {id: event.pointerId, edge: resizeEdge, start: stage.getBoundingClientRect(),
                position: position && {...position}};
            return;
        }
        const header = target.closest('[data-stage-drawer-handle]');
        const control = target.closest(controls);
        if (!header || !drawer.contains(header) || (control && header.contains(control))) return;
        const {left, top} = stage.getBoundingClientRect();
        drag = {id: event.pointerId, x: event.clientX, y: event.clientY,
            offsetX: event.clientX - left, offsetY: event.clientY - top, moved: false};
        drawer.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function move(event: PointerEvent) {
        if (drag?.id !== event.pointerId) return;
        if (!drag.moved) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
            drag.moved = true;
            stage.setAttribute('data-stage-drawer-dragging', '');
            focus();
        }
        const area = bounds();
        const x = area.width ? 2 * clamp((event.clientX - drag.offsetX - area.left) / area.width) - 1 : 0;
        const y = area.height ? 2 * clamp((event.clientY - drag.offsetY - area.top) / area.height) - 1 : 0;
        // Project from the center of the travel area so changing edges passes through a corner.
        const distance = Math.max(Math.abs(x), Math.abs(y));
        if (distance) position = {x: (1 + x / distance) / 2, y: (1 + y / distance) / 2};
        place(area);
    }

    function finish(event: PointerEvent) {
        if (resizeDrag?.id === event.pointerId) {
            place();
            resizeDrag = undefined;
        }
        if (drag?.id !== event.pointerId) return;
        drag = undefined;
        stage.removeAttribute('data-stage-drawer-dragging');
    }

    const handlers = {pointerdown: start, pointermove: move, pointerup: finish,
        pointercancel: finish, lostpointercapture: finish};
    for (const [name, handler] of Object.entries(handlers)) drawer.addEventListener(name, handler);
    const resize = () => place();
    const observer = new view.ResizeObserver(resize);
    observer.observe(editor);
    observer.observe(stage);
    view.addEventListener('resize', resize);
    place();
    return () => {
        for (const [name, handler] of Object.entries(handlers)) drawer.removeEventListener(name, handler);
        if (drag && drawer.hasPointerCapture(drag.id)) drawer.releasePointerCapture(drag.id);
        observer.disconnect();
        view.removeEventListener('resize', resize);
        stage.removeAttribute('data-stage-drawer-dragging');
        stage.removeAttribute('data-stage-drawer-positioned');
        stage.removeAttribute('data-stage-drawer-contacts');
        stage.removeAttribute('data-stage-drawer-edge');
        stage.style.removeProperty('--plus-stage-drawer-x');
        stage.style.removeProperty('--plus-stage-drawer-y');
    };
}
