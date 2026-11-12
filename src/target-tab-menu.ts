import React from 'react';
import type {IContextMenuItemRenderer} from 'dockview';

interface TargetTabs {
    locale: string;
    list(id?: string): readonly {id: string; title: string}[];
    select(id?: string): void;
    activate(id: string): void;
}

interface MenuPrimitives {
    MenuItem: React.ElementType;
    SubMenu: React.ElementType;
    menuClassName: string;
    itemClassName: string;
}

const pencil = 'm4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4';
const open = 'M13 4h7v7m0-7-9 9m-1-8H4v15h15v-6';
const tabMenuIcons = {
    rename: pencil,
    'new-tab': 'M3 4h18v16H3zM3 10h18M11 4l3 6m-4 5h4m-2-2v4'
};
const iconClass = 'tw-plus-target-menu-icon';
const svgNamespace = 'http://www.w3.org/2000/svg';
const isJapanese = (locale: string) => /^ja(?:-|$)/i.test(locale);
export const spriteRenameLabel = (locale: string) => isJapanese(locale) ? 'スプライト名の変更' : 'Rename sprite';

export const SpriteTargetTabsContext = React.createContext<TargetTabs | null>(null);

export function createTargetTabMenuItem(document: Document, title: string, iconName: keyof typeof tabMenuIcons,
    action: (id: string) => void): IContextMenuItemRenderer {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'dv-context-menu-item tw-plus-target-menu-button';
    element.setAttribute('role', 'menuitem');
    const icon = document.createElementNS(svgNamespace, 'svg');
    icon.setAttribute('class', iconClass);
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', tabMenuIcons[iconName]);
    icon.append(path);
    element.append(icon, title);
    return {
        element,
        init(props) {
            if (!('panel' in props)) return;
            element.onclick = () => {
                props.close();
                action(props.panel.id);
            };
        },
        dispose() {
            element.onclick = null;
        }
    };
}

const itemLabel = (path: string, label: string) => React.createElement(React.Fragment, null,
    React.createElement('svg', {className: iconClass, 'aria-hidden': true, viewBox: '0 0 24 24'},
        React.createElement('path', {d: path})), label);

export function useTargetTabMenu() {
    const tabs = React.useContext(SpriteTargetTabsContext);
    const [shown, setShown] = React.useState<{id?: string; views: ReturnType<TargetTabs['list']>}>();
    if (!tabs) return null;
    return {
        onShow(id?: string) {
            // Read the live order even if the last move did not change the selection.
            setShown({id, views: tabs.list(id)});
        },
        select: tabs.select,
        render({MenuItem, SubMenu, menuClassName, itemClassName}: MenuPrimitives, id?: string,
            rename?: (event: React.MouseEvent) => void) {
            const views = shown?.id === id ? shown?.views ?? [] : [];
            const label = itemLabel(open, isJapanese(tabs.locale) ? '開く' : 'Open');
            const attributes = {className: itemClassName, 'data-tw-plus-menu-icon': ''};
            const openItem = views.length > 1 ? React.createElement(SubMenu, {
                title: React.createElement(React.Fragment, null, label,
                    React.createElement('span', {className: 'tw-plus-target-submenu-arrow', 'aria-hidden': true}, '›')),
                className: `${menuClassName} tw-plus-target-submenu`,
                attributes
            }, views.map(view => React.createElement(MenuItem, {
                key: view.id, attributes: {className: itemClassName},
                onClick: (event: React.MouseEvent) => {
                    event.stopPropagation();
                    tabs.activate(view.id);
                }
            }, view.title))) : React.createElement(MenuItem, {
                attributes,
                onClick: (event: React.MouseEvent) => {
                    event.stopPropagation();
                    tabs.select(id);
                }
            }, label);
            return {
                open: openItem,
                rename: rename && React.createElement(MenuItem, {attributes, onClick: rename},
                    itemLabel(pencil, spriteRenameLabel(tabs.locale)))
            };
        }
    };
}
