import type {DrawerMenu, DrawerMenuRenderProps} from './drawer-views.ts';
import {agentsIconPath} from './drawer-views.ts';
import {
    agentPresets, agentSettingsKey, agentText, browserStorage, enabledAgentServices, openAgentService,
    openAgentSettingsDialog, readAgentSettings, type AgentService, type AgentStorage, type Opener
} from './ai-agent-settings.ts';

export * from './ai-agent-settings.ts';

export interface AiAgentsOptions {
    /** The workbench stylesheet's class names (`editor.css`), for the menu and the settings dialog. */
    styles?: Record<string, string>;
    storage?: AgentStorage | null;
    storageKey?: string;
    /** Opens a service; defaults to a new browser tab. */
    open?: Opener;
}

/**
 * The AI agent menu for `drawerViews.agents`, the settings dialog and the icon the host shows beside
 * its own entry for the dialog. Every part reads the saved settings when it opens.
 */
export function createAiAgents(React, {styles = {}, storage = browserStorage(), storageKey = agentSettingsKey,
    open}: AiAgentsOptions = {}) {
    const {createElement: element, useRef, useState} = React;
    const svg = (...children) => element('svg', {
        'aria-hidden': true, focusable: false, width: 16, height: 16, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, ...children);
    const bubble = 'M3 2.5h10a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5H3A1.5 1.5 0 0 1 1.5 10V4A1.5 1.5 0 0 1 3 2.5Z';
    // The initials are drawn as strokes so they do not depend on a font or add to the item's text.
    const initials = {
        C: 'M9.9 5.6A2.4 2.4 0 1 0 9.9 8.4',
        G: 'M9.9 5.6A2.4 2.4 0 1 0 10.4 7H8.4'
    };
    /** A plain chat bubble with the service's initial for a preset; a globe for the user's own address. */
    const serviceIcon = (service: AgentService) => {
        const preset = agentPresets.find(item => item.id === service.preset);
        if (preset) {
            const svgElement = svg(element('path', {d: bubble}), element('path', {d: initials[preset.letter]}));
            return React.cloneElement(svgElement, {'data-initial': preset.letter});
        }
        return svg(element('circle', {cx: 8, cy: 8, r: 6.25}), element('path', {d: 'M1.75 8h12.5M8 1.75c-3 3.4-3 9.1 0 12.5M8 1.75c3 3.4 3 9.1 0 12.5'}));
    };
    const settingsIcon = () => svg(element('path', {d: agentsIconPath}));

    const openSettings = ({locale, returnFocus}: {locale: string; returnFocus?: HTMLElement | null}) =>
        openAgentSettingsDialog({document, locale, styles, storage, storageKey, returnFocus});

    function AgentMenu({locale, close}: DrawerMenuRenderProps) {
        const [services] = useState(() => enabledAgentServices(readAgentSettings(storage, storageKey)));
        const list = useRef(null);
        const hintId = useRef(null);
        if (!hintId.current) hintId.current = `plus-agent-menu-hint-${++nextId}`;
        const label = agentText('menu', locale);
        const newTab = agentText('newTab', locale);
        const move = event => {
            const items = [...list.current.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
            const index = items.indexOf(event.target);
            let next: number;
            if (event.key === 'ArrowDown') next = (index + 1) % items.length;
            else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else return;
            event.preventDefault();
            items[next]?.focus();
        };
        const item = (key: string, icon, text: string, onClick: () => void, title?: string) => element('button', {
            key, type: 'button', role: 'menuitem', tabIndex: -1, className: styles.aiAgentMenuItem, title, onClick
        }, icon, element('span', null, text));
        return element(React.Fragment, null,
            !services.length && element('p', {id: hintId.current, className: styles.aiAgentMenuHint}, agentText('empty', locale)),
            element('div', {
                role: 'menu', 'aria-label': label, ref: list, className: styles.aiAgentMenu, onKeyDown: move,
                'aria-describedby': services.length ? undefined : hintId.current
            },
            services.map(service => item(service.id, serviceIcon(service), service.name, () => {
                openAgentService(service, open);
                close();
            }, newTab)),
            services.length > 0 && element('div', {role: 'separator', className: styles.aiAgentMenuSeparator}),
            item('settings', settingsIcon(), agentText('settings', locale), () => {
                close();
                openSettings({locale, returnFocus: document.activeElement as HTMLElement});
            })));
    }

    const drawerMenu: DrawerMenu = {
        renderMenu: props => element(AgentMenu, props)
    };
    return {drawerMenu, openSettings, settingsIcon, serviceIcon};
}

let nextId = 0;
