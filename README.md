# TurboWarp Plus Editor Layout

[日本語](README.ja.md)

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

The Editor locks version `0.1.0` of this package as a local dependency and pins its source alongside the Editor revision.

## Verification

Run `npm test` to verify split sizing, aspect ratios, and settings persistence. Run `npm run test:browser` to test the standalone host. To open the test host manually, run `npm install` and `python3 -m http.server` in this directory, then open `/example/`.

From the Editor root, build the GUI pinned in `site/source.json` with `npm run build:pages`, then run `E2E_GUI_ROOT=/absolute/gui-checkout E2E_PATH_PREFIX=/turbowarp-plus-editor/ node --test test/editor-layout.browser.ts`. To verify the GUI on its own, set `E2E_LAYOUT_BARE_BUILD` to the directory where the same GUI was built without the host integration.

## Separate stage window and sprite properties

`attachStageInput` manages input subscriptions and cleanup using the separate window's document and canvas provided by the host. Pointer handling and drag cleanup use the host's callbacks.

`sprite-properties` provides the properties form and list styles, rejects stale edits when the selected sprite changes, and applies updates to the VM. The host provides the selected values, the VM, the fallback form, and the mount point.

The properties form came from the previous sprite properties source at `80825f7`, and the window components came from the source of the previous release archive at `b0390c3`. The extraction kept the upstream Scratch GUI implementation in its original repository. Its existing license is GPL-3.0-or-later.

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
Variables. It lists, in a sent group and a received group, which message each block broadcasts and which
message each hat waits for. Messages that are only sent, only received, or present in the project but
unused by this target are marked. The stage's Messages section also draws the whole project as sprite or
stage, message, sprite or stage, keeping isolated messages in the picture. A message can be renamed from
the list and from the diagram; the stage owns `broadcast_msg` variables, so a rename applies project-wide.
`messageReference` in `./project-messages` is the only place that decides what sends or receives a message,
and the editor's project search calls the same function.
