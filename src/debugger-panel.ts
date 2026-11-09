/**
 * Show the editor add-on's debugger as a workspace tab rather than a card floating over the editor.
 *
 * The add-on builds the debugger, keeps its state, and opens or closes it by setting the element's
 * inline `display`; the build hands that element and the add-on's own visibility setter to the
 * host instead of appending it to the body. This module decides where the element lives:
 *
 * - While the workspace accepts a panel, opening the debugger opens a tab there and the element
 *   moves into it. Closing the tab closes the debugger through the add-on, and closing the debugger
 *   (its own button, or a mode switch) closes the tab, so the two never disagree.
 * - Otherwise it stays the add-on's floating card in the body, as it was before.
 *
 * Its looks follow the editor's theme in both places; `debugger-panel.css` owns that. The host imports
 * it as a global stylesheet, since it restyles the add-on's own class names.
 */
import {getDocumentWorkspace} from './document-workspace.ts';
import type {DocumentPanelRequest} from './document-workspace.ts';

export interface DebuggerInterface {
    element: HTMLElement;
    setVisible(visible: boolean): void;
    /** The GUI's language. The page's `lang` is not kept up to date in every layout. */
    getLocale?(): string | undefined;
}

interface DebuggerPanelOptions {
    document: Document;
    /** The project whose workspace takes the tab. */
    vm: object;
    getLocale?(): string | undefined;
}

export const dockedClass = 'tw-plus-debugger-docked';
export const debuggerReference = Object.freeze({providerId: 'turbowarp-plus', documentId: 'debugger'});
const buttonSelector = '.sa-debugger-container';

export const debuggerTitle = (locale: string) => (/^ja(?:-|$)/i.test(locale) ? 'デバッガー' : 'Debugger');

export function attachDebuggerPanel (debuggerInterface: DebuggerInterface, options: DebuggerPanelOptions) {
    const {element, setVisible} = debuggerInterface;
    const {document} = options;
    const workspace = getDocumentWorkspace(options.vm);
    const getLocale = () => debuggerInterface.getLocale?.() || options.getLocale?.() ||
        document.documentElement.lang || 'en';
    // The panel's close callback while the debugger is docked, and null while it floats.
    let close: (() => void) | null = null;
    let opening = false;
    const isVisible = () => element.style.display !== '' && element.style.display !== 'none';

    const request = (): DocumentPanelRequest => {
        const title = debuggerTitle(getLocale());
        return {
            reference: debuggerReference,
            filename: title,
            title,
            transient: true,
            mount (slot, closePanel) {
                close = closePanel;
                element.classList.add(dockedClass);
                slot.append(element);
                return {
                    requestClose () {
                        // The add-on hides the element, and the observer then closes the tab.
                        if (isVisible()) setVisible(false);
                        else closePanel();
                    },
                    dispose () {
                        if (close !== closePanel) return;
                        close = null;
                        element.classList.remove(dockedClass);
                        document.body.append(element);
                        if (isVisible()) setVisible(false);
                    }
                };
            }
        };
    };

    const dock = () => {
        if (opening) return;
        opening = true;
        try {
            // A workspace that already has the tab only activates it. Without one, the debugger floats.
            workspace.open(request());
        } finally {
            opening = false;
        }
    };

    const observer = new document.defaultView.MutationObserver(() => {
        if (isVisible()) {
            if (!close) dock();
        } else if (close) {
            close();
        }
    });
    observer.observe(element, {attributes: true, attributeFilter: ['style']});

    // Opening an already open debugger leaves its style as it is, so the tab is brought forward here.
    const handleButton = (event: Event) => {
        if (close && (event.target as Element | null)?.closest?.(buttonSelector)) dock();
    };
    document.addEventListener('click', handleButton);

    // The add-on drags its card by the header. In a tab there is nothing to drag, and the drag would
    // write a stale position onto the element.
    const handlePointerDown = (event: Event) => {
        const header = element.firstElementChild;
        if (close && header?.contains(event.target as Node)) event.stopPropagation();
    };
    element.addEventListener('pointerdown', handlePointerDown, {capture: true});

    document.body.append(element);
    if (isVisible()) dock();

    return {
        dispose () {
            observer.disconnect();
            document.removeEventListener('click', handleButton);
            element.removeEventListener('pointerdown', handlePointerDown, {capture: true});
            close?.();
        }
    };
}
