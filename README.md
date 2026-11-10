# TurboWarp Plus Editor Workbench

[日本語](README.ja.md)

The workbench of TurboWarp Plus Editor: the resizable layout, the Plus standard layout, the Dockview sprite tabs and workspace, the stage surface, the debugger tab and the file menu. The panes inside a sprite tab come from `@kubohiroya/turbowarp-plus-editor-sprite-panes`, the in-page windows from `@kubohiroya/turbowarp-plus-editor-windows`, and project data from `@kubohiroya/turbowarp-plus-editor-project-model`.

This package was published as `@kubohiroya/turbowarp-plus-editor-layout` up to 0.3.0.

## Resizable layout

Resize the divider between the editor and the stage column, or the divider between the stage and the target pane, within a single document. The host passes its React instance to `createLayout(React)` and connects the dividers, styles, and display dimensions provided by the `render` callback to its existing components. The host supplies a storage provider and key, and this package saves and restores the layout settings.

Drag a divider or use the arrow keys, Home, or End to move it. Press Enter or double-click to reset that divider to its default position.

## Editor layout sizing

| Divider | Minimum sizes |
| --- | --- |
| Editor / stage column | Editor 500 px, stage column 350 px |
| Stage / target pane | Stage 135 px, target pane 175 px |

Dividers are 8 px wide. Each split is constrained by the minimum size of its panes. If the available space is too small to satisfy both minimums, the editor falls back to its usual sizing. The split resumes at the saved ratio when the available space grows. The sprite properties and list stay together in the sprite selector, and the backpack remains a collapsible tray. The menu bar sits outside the split area.

Dividers are enabled by default in the Scratch layout. Selecting a stage size preset resets the split to that preset. Layout settings are stored separately from projects and SB3 files. To disable the dividers, add `twPlusSplitter=0` to the Web launch URL or start Desktop with `TW_PLUS_DESKTOP_SPLITTER=0`.

## Plus standard layout

`createStandardLayout(React, {styles, targetStyles, context})` handles layout switching via the anchor control (⚓️), stage visibility and measurement, and the two-column sprite list. Pass `editor.css` and `targets.css` as class-name maps. The host provides startup settings, storage, window controls, and the callback and mount point for the palette. Pass an optional `LayoutMenu` component to the factory to customize the layout menu. The stage keeps the same mount point while hidden.

Use `/example/?standard=1` in the test host to try the Plus layout. Use `standard=0` to try the startup fallback to the Scratch layout.

The Editor pins this package from npm.

## Left drawer views

In the Plus standard layout, the left drawer shows the sprite list and backdrop. A host can add more contents by passing `drawerViews` to `StandardLayout`:

```js
<StandardLayout {...props} storage={localStorage} storageKey="twPlusEditorLayout" drawerViews={{
    views: [
        {id: 'project', render: ({locale}) => <ProjectExplorer locale={locale} />, tools: ({locale}) => <ExplorerTools />},
        {id: 'git-history', label: 'Git history', icon: <HistoryIcon />, render: () => <GitHistory />}
    ],
    agents: {renderMenu: ({locale, close}) => <div role="menu">…</div>}
}} />
```

- The top of the drawer then shows one row of icon-only buttons (it wraps only when the drawer is too narrow) (`role="toolbar"`, "ドロワーの表示" / "Drawer views"): 1 Sprites, 2 Project folder, 3 Git history and 4 AI agents. Each has `aria-label` and `title` in Japanese or English. A button is shown only for what the host supplies; the sprite list is always first.
- Buttons 1–3 switch the content and mark the selected one with `aria-pressed`. Arrow keys move between the buttons with one tab stop (left and right wrap around, Home and End go to the ends); Enter and Space activate.
- `id` is `project` or `git-history`; unknown and repeated ids are ignored. `label` and `icon` default to the package's names and 16 px `currentColor` icons. `render` is called only while the view is selected. `tools` is shown where the sprite list shows its search, pin and undock buttons. Search and undock appear only while the sprite list is selected; the pin button, which pins the drawer itself, stays in every view. The GUI's target pane stays mounted, hidden, while another view is shown.
- Button 4 is a menu button (`aria-haspopup="menu"`, `aria-expanded`). `renderMenu` renders the menu content, normally one `role="menu"` element with `menuitem` children. The first item gets focus when the menu opens. Escape, a press outside or `close()` closes it and returns focus to the button. The menu does not change the drawer's content.
- The selected view is saved in `storage` under `<storageKey>.drawer` (`{"version": 1, "view": "project"}`), next to the split layout. A saved view the host does not supply falls back to the sprite list and comes back when the host supplies it again.
- Without `drawerViews`, or with no supported views and no `agents`, the drawer is unchanged: no bar and no extra element around the sprite list. Supply the views from startup; adding the first one later remounts the GUI's target pane once.

Use `/example/?standard=1&drawer=1&lang=ja` in the test host to try the bar with sample views.

## Verification

Run `npm test` to verify split sizing, aspect ratios, and settings persistence. Run `npm run test:browser` to test the standalone host. To open the test host manually, run `npm install` and `python3 -m http.server` in this directory, then open `/example/`.

From the Editor root, build the GUI pinned in `site/source.json` with `npm run build:pages`, then run `E2E_GUI_ROOT=/absolute/gui-checkout E2E_PATH_PREFIX=/turbowarp-plus-editor/ node --test test/editor-layout.browser.ts`. To verify the GUI on its own, set `E2E_LAYOUT_BARE_BUILD` to the directory where the same GUI was built without the host integration.

## Separate stage window

`attachStageInput` manages input subscriptions and cleanup using the separate window's document and canvas provided by the host. Pointer handling and drag cleanup use the host's callbacks.

The panes inside a sprite editing tab (assets and variables, messages, the properties form and the section toolbar) now live in `@kubohiroya/turbowarp-plus-editor-sprite-panes`; this package arranges them into tabs and splits. The window components, which came from the source of the previous release archive at `b0390c3`, now live in `@kubohiroya/turbowarp-plus-editor-windows`. The extraction kept the upstream Scratch GUI implementation in its original repository, so this package carries no GPL code and imports no GPL module. It is licensed MPL-2.0, which the GPL-3.0 Editor can still bundle because MPL-2.0 treats the GPL as a Secondary License. The source files carry no “Incompatible With Secondary Licenses” notice, and must not: that notice would make the package unusable in the Editor.

## Debugger tab

`attachDebuggerPanel(debugger, {document, vm})` opens the debugger add-on's window as a Dockview tab. The host passes the add-on's window element, the add-on's own visibility setter, and a function returning the GUI's language. While the workspace takes panels the debugger opens as a "Debugger" tab, and closing either the tab or the debugger closes the other. Otherwise it stays the floating window it was. The tab is transient and is left out of the saved layout.

`debugger-panel.css` restyles the add-on's own class names, so the host loads it as a global stylesheet. In the tab and the floating window alike it replaces the add-on's fixed teal with the GUI's theme variables.

## Local verification with the Editor

Run `npm test` to check tab state, file menu actions, and the existing layout. Set `TW_PLUS_LAYOUT_EDITOR_URL` to an Editor URL built with the pinned Scratch GUI and run `npm run test:browser` to verify Dockview through the existing tab strip and editor panel integration. Set `TW_PLUS_LAYOUT_FILE_MENU_URL` for the same command to check a GUI build with the optional file menu integration.

`.github/workflows/release.yml` publishes to npm. On a push to `main` it publishes only when the
version in `package.json` is not on npm yet, and only after the tests pass; an existing version
publishes nothing. It authenticates with npm's trusted publisher (OIDC) through the `id-token: write`
permission instead of a token, so npm's configuration records this workflow's filename: rename the
file and the npm setting has to follow.

Sprite editing tabs are enabled by default in the Plus standard layout. Set `twPlusDockviewSpriteTabs=0` to restore the previous editing view. When the Editor exposes the file menu integration, the menu shows item icons and the Add Extension command. Set `twPlusExtensionFileMenu=0` to use the button at the bottom left again. Reload the editor after changing startup parameters.

In the Plus web editor, add `twPlusDockview=1` to enable split sprite panes. Each pane remembers its section, costume and sound selections, and asset-list scroll position. Variable values are shared across panes and can be changed in the active pane. Remove the startup parameter and reload to return to the regular sprite tabs.

The sprite and stage editor tabs carry a Messages section after Code, Costumes or Backdrops, Sounds and
Variables, drawn by `SpriteMessagePane` from `@kubohiroya/turbowarp-plus-editor-sprite-panes`. The stage owns
`broadcast_msg` variables, so a rename applies project-wide. `messageReference` in `@kubohiroya/turbowarp-plus-editor-project-model` is the only place that decides what
sends or receives a message, and the editor's project search calls the same function. This package's
`./project-messages` re-exports it for existing imports.
