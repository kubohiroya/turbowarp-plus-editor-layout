import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {attachDebuggerPanel, debuggerReference, dockedClass} from '../dist/debugger-panel.js';
import {getDocumentWorkspace} from '../dist/document-workspace.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// A stand-in for the editor add-on: it opens and closes its window only through the inline display,
// and drags the window by its header.
const createDebugger = (document: Document) => {
    const element = document.createElement('div');
    element.className = 'sa-debugger-interface';
    const header = document.createElement('div');
    const tab = document.createElement('li');
    header.append(tab);
    element.append(header);
    const button = document.createElement('div');
    button.className = 'sa-debugger-container';
    document.body.append(button);
    const visibility: boolean[] = [];
    const setVisible = (visible: boolean) => {
        visibility.push(visible);
        element.style.display = visible ? 'flex' : '';
    };
    button.addEventListener('click', () => setVisible(true));
    let drags = 0;
    header.addEventListener('pointerdown', () => drags++);
    return {element, header, tab, button, setVisible, visibility, drags: () => drags};
};

// What the sprite tabs connect: one panel per reference, and a repeated open only activates it.
const connectWorkspace = (vm: object, document: Document) => {
    const panels = new Map<string, {slot: HTMLElement; title: string; session: {requestClose(): void; dispose(): void}}>();
    let activations = 0;
    const key = (reference: {providerId: string; documentId: string}) => reference.providerId + '/' + reference.documentId;
    const disconnect = getDocumentWorkspace(vm).connect(request => {
        const id = key(request.reference);
        if (panels.has(id)) {
            activations++;
            return;
        }
        const slot = document.createElement('div');
        document.body.append(slot);
        const close = () => {
            const panel = panels.get(id);
            if (!panel) return;
            panels.delete(id);
            panel.slot.remove();
            panel.session.dispose();
        };
        const panel = {slot, title: request.title, session: undefined};
        panels.set(id, panel);
        panel.session = request.mount(slot, close);
    });
    return {panel: () => panels.get(key(debuggerReference)), activations: () => activations, disconnect};
};

const click = (window: Window, element: Element) =>
    element.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));

test('the debugger opens as a workspace tab and closes with it from either side', async () => {
    // The page's language is not set in every layout; the GUI's own locale names the tab.
    const {window} = new JSDOM('<!doctype html><html lang=""><body></body></html>');
    const {document} = window;
    const vm = {};
    const workspace = connectWorkspace(vm, document);
    const debug = {...createDebugger(document), getLocale: () => 'ja'};
    const attached = attachDebuggerPanel(debug, {document, vm});
    assert.equal(debug.element.parentElement, document.body, 'a closed debugger waits in the body');

    click(window, debug.button);
    await settle();
    const panel = workspace.panel();
    assert.equal(debug.element.parentElement, panel.slot, 'opening moves the window into the tab');
    assert.ok(debug.element.classList.contains(dockedClass));
    assert.equal(panel.title, 'デバッガー');

    // Opening it again brings the existing tab forward instead of adding another.
    click(window, debug.button);
    await settle();
    assert.equal(workspace.activations(), 1);
    assert.equal(workspace.panel(), panel);

    // In a tab the header is not a drag handle.
    debug.tab.dispatchEvent(new window.Event('pointerdown', {bubbles: true}));
    assert.equal(debug.drags(), 0);

    // The tab's close button closes the debugger through the add-on.
    panel.session.requestClose();
    await settle();
    assert.equal(workspace.panel(), undefined);
    assert.equal(debug.visibility.at(-1), false);
    assert.equal(debug.element.parentElement, document.body);
    assert.ok(!debug.element.classList.contains(dockedClass));

    // Closing the debugger itself closes its tab.
    debug.setVisible(true);
    await settle();
    assert.ok(workspace.panel());
    debug.setVisible(false);
    await settle();
    assert.equal(workspace.panel(), undefined);
    assert.equal(debug.element.parentElement, document.body);
    attached.dispose();
    workspace.disconnect();
});

test('without a workspace that takes panels the debugger stays the floating window', async () => {
    const {window} = new JSDOM('<!doctype html><html lang="en"><body></body></html>');
    const {document} = window;
    const debug = createDebugger(document);
    attachDebuggerPanel(debug, {document, vm: {}});
    debug.setVisible(true);
    await settle();
    assert.equal(debug.element.parentElement, document.body);
    assert.ok(!debug.element.classList.contains(dockedClass));
    debug.header.dispatchEvent(new window.Event('pointerdown', {bubbles: true}));
    assert.equal(debug.drags(), 1, 'the floating window still drags by its header');
});
