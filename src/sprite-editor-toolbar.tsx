import React from 'react';

export const spriteEditorSections = ['code', 'costumes', 'sounds', 'variables'] as const;
export type SpriteEditorSection = typeof spriteEditorSections[number];

export interface SpriteSearchResult {
    id: string;
    label: string;
}

export interface SpriteEditorSearch {
    find(query: string, section: SpriteEditorSection): readonly SpriteSearchResult[];
    select(result: SpriteSearchResult, section: SpriteEditorSection): void;
    onFocus?(): void;
}

interface SpriteEditorToolbarProps {
    viewId: string;
    locale: string;
    section: SpriteEditorSection;
    onSectionChange(section: SpriteEditorSection): void;
    isStage?: boolean;
    activeGroup?: boolean;
    search?: SpriteEditorSearch;
    availableSections?: readonly SpriteEditorSection[];
    propertiesInVariables?: boolean;
    actions?: React.ReactNode;
}

const glyphs: Record<SpriteEditorSection | 'search', string> = {
    code: 'm5.5 4-4 4 4 4m5-8 4 4-4 4',
    costumes: 'm6 9 5.5-6.5a1.4 1.4 0 0 1 2 2L7.5 11m-2-2a2.5 2.5 0 0 0-3 2.5L2 14c2.7 0 5-1 5-3a2 2 0 0 0-1.5-2Z',
    sounds: 'M2 6h3l4-3v10l-4-3H2Zm9.5 0a3 3 0 0 1 0 4m2-6a5.5 5.5 0 0 1 0 8',
    variables: 'M5 2H3v12h2m6-12h2v12h-2M6 6l4 4m0-4-4 4',
    search: 'M10 10l3 3M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'
};

function Icon({kind}: {kind: keyof typeof glyphs}) {
    return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"><path d={glyphs[kind]} /></svg>;
}

function SearchBox({viewId, section, japanese, search}: {
    viewId: string; section: SpriteEditorSection; japanese: boolean; search: SpriteEditorSearch;
}) {
    const [query, setQuery] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [index, setIndex] = React.useState(-1);
    const [focused, setFocused] = React.useState(false);
    const results = open && focused && query.trim() ? search.find(query.trim(), section) : [];
    const listId = viewId + '-search-results';
    const selected = results[index];
    const expanded = results.length > 0;
    const optionId = (position: number) => listId + '-' + position;

    function choose(result: SpriteSearchResult) {
        setOpen(false);
        setIndex(-1);
        search.select(result, section);
    }

    return <div className="tw-plus-sprite-search">
        <div className="tw-plus-sprite-search-field">
            <Icon kind="search" />
            <input type="search" role="combobox" autoComplete="off" aria-autocomplete="list"
                aria-label={japanese ? 'スプライト内を検索' : 'Search within this sprite'}
                aria-controls={expanded ? listId : undefined} aria-expanded={expanded}
                aria-activedescendant={selected ? optionId(index) : undefined}
                placeholder={japanese ? '検索' : 'Search'} value={query}
                onFocus={() => {setFocused(true); setOpen(true); search.onFocus?.();}}
                onBlur={() => {setFocused(false); setIndex(-1);}}
                onChange={event => {setQuery(event.currentTarget.value); setOpen(true); setIndex(-1);}}
                onKeyDown={event => {
                    if (event.key === 'Escape' && expanded) {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                        setIndex(-1);
                    } else if (expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                        event.preventDefault();
                        const offset = event.key === 'ArrowDown' ? 1 : -1;
                        setIndex(selected ? (index + offset + results.length) % results.length :
                            offset === 1 ? 0 : results.length - 1);
                    } else if (event.key === 'Enter' && selected) {
                        event.preventDefault();
                        choose(selected);
                    }
                }} />
        </div>
        {expanded && <ul role="listbox" id={listId} aria-label={japanese ? '検索結果' : 'Search results'}>
            {results.map((result, position) => <li key={result.id} id={optionId(position)} role="option"
                aria-selected={position === index} onPointerDown={event => event.preventDefault()}
                onClick={() => choose(result)}>{result.label}</li>)}
        </ul>}
    </div>;
}

export function SpriteEditorToolbar({viewId, locale, section, onSectionChange, isStage, activeGroup, search,
    availableSections = spriteEditorSections, propertiesInVariables = false, actions}: SpriteEditorToolbarProps) {
    const [tooltip, setTooltip] = React.useState<{button: HTMLButtonElement; id: SpriteEditorSection; y: number}>();
    const japanese = /^ja(?:-|$)/i.test(locale);
    const labels = japanese ? {code: 'コード', costumes: isStage ? '背景' : 'コスチューム', sounds: '音', variables: propertiesInVariables ? '変数など' : '変数'} :
        {code: 'Code', costumes: isStage ? 'Backdrops' : 'Costumes', sounds: 'Sounds', variables: propertiesInVariables ? 'Properties & Variables' : 'Variables'};

    function showTooltip(button: HTMLButtonElement, id: SpriteEditorSection) {
        const tab = button.getBoundingClientRect();
        const rail = button.parentElement.getBoundingClientRect();
        const y = (tab.top + tab.bottom) / 2;
        setTooltip(y >= rail.top && y <= rail.bottom ? {button, id, y: y - rail.top} : undefined);
    }

    function hideTooltip(button: HTMLButtonElement) {
        setTooltip(current => current?.button === button ? undefined : current);
    }

    return <div className="tw-plus-sprite-toolbar" data-active-group={activeGroup}>
        <div className="tw-plus-sprite-toolbar-sections" role="tablist" aria-orientation="vertical"
            aria-label={japanese ? 'スプライトの編集内容' : 'Sprite editor sections'}
            onScroll={() => { if (tooltip) showTooltip(tooltip.button, tooltip.id); }}>
            {availableSections.map((id, index) => <button key={id} type="button" role="tab"
                id={viewId + '-section-' + id} aria-label={labels[id]} aria-selected={section === id}
                tabIndex={section === id ? 0 : -1}
                onMouseEnter={event => showTooltip(event.currentTarget, id)}
                onMouseLeave={event => {
                    if (!event.currentTarget.matches(':focus-visible')) hideTooltip(event.currentTarget);
                }}
                onFocus={event => {
                    if (event.currentTarget.matches(':focus-visible')) showTooltip(event.currentTarget, id);
                }}
                onBlur={event => hideTooltip(event.currentTarget)}
                aria-controls={viewId + '-content'} onClick={() => onSectionChange(id)} onKeyDown={event => {
                    if (event.key === 'Escape' && tooltip) {
                        event.stopPropagation();
                        setTooltip(undefined);
                        return;
                    }
                    const next = {ArrowUp: index - 1, ArrowDown: index + 1,
                        Home: 0, End: availableSections.length - 1}[event.key];
                    if (next === undefined) return;
                    event.preventDefault();
                    const position = (next + availableSections.length) % availableSections.length;
                    onSectionChange(availableSections[position]);
                    event.currentTarget.parentElement.querySelectorAll<HTMLButtonElement>('button')[position]?.focus();
                }}>
                <Icon kind={id} />
            </button>)}
        </div>
        {tooltip && <span className="tw-plus-sprite-toolbar-tooltip" aria-hidden="true"
            style={{top: tooltip.y}}>{labels[tooltip.id]}</span>}
        {(search || actions) && <div className="tw-plus-sprite-toolbar-tools">
            {actions}
            {search && <SearchBox {...{viewId, section, japanese, search}} />}
        </div>}
    </div>;
}
