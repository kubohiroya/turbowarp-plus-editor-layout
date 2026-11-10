# TurboWarp Plus Editor Workbench

TurboWarp Plus Editor の作業画面。分割レイアウト、Plus 標準配置、Dockview のスプライトタブとワークスペース、ステージ、デバッガーのタブ、ファイルメニューを担う。スプライトタブの中のペインは `@kubohiroya/turbowarp-plus-editor-sprite-panes`、ページ内の窓は `@kubohiroya/turbowarp-plus-editor-windows`、作品データの読み取りは `@kubohiroya/turbowarp-plus-editor-project-model` から使う。

このパッケージは 0.3.0 まで `@kubohiroya/turbowarp-plus-editor-layout` として公開していた。

## 分割レイアウト

同じ document 内で「編集領域／ステージ列」と「ステージ／対象領域」の境界を調整する。ホストは `createLayout(React)` に既存の React を渡し、`render` に渡される境界・スタイル・表示サイズを既存コンポーネントに接続する。ホストがストレージとキーを指定し、このパッケージが設定を保存・復元する。

境界はドラッグ、矢印キー、Home／End で移動できる。Enter またはダブルクリックで、その境界を既定の位置に戻す。

## Editor での配分

| 境界 | 最小サイズ |
| --- | --- |
| 編集領域／ステージ列 | 編集領域 500 px、ステージ列 350 px |
| ステージ／対象領域 | ステージ 135 px、対象領域 175 px |

境界の幅は 8 px。分割比率は各領域の最小サイズまでに制限する。最小サイズを両立できない表示領域では通常配分に戻し、表示領域を広げると保存した比率で分割を再開する。プロパティと一覧はスプライト選択ペイン内にまとまっており、バックパックは開閉式のトレイなので、この段階では既存の操作で扱う。メニューバーは分割領域の外にある。

Scratch 配置では分割を既定で有効にする。既存のステージサイズボタンを押すと、指定したプリセットで配分を初期化する。設定は作品や SB3 と別に保存する。分割だけを無効にする場合は Web の起動 URL に `twPlusSplitter=0` を指定するか、Desktop を `TW_PLUS_DESKTOP_SPLITTER=0` で起動する。

## Plus 標準配置

`createStandardLayout(React, {styles, targetStyles, context})` は、⚓️ での配置切り替え、ステージの表示と計測、スプライト一覧の2列配置を担当する。`editor.css` と `targets.css` をクラス名マップとして渡す。ホストは起動設定、ストレージ、ウィンドウ操作部品、パレット表示のコールバックと描画先を渡す。配置メニューの描画を差し替える場合は、任意の `LayoutMenu` コンポーネントをファクトリーに渡す。ステージを隠しても同じ描画先を使う。

試験用ホストの `/example/?standard=1` で Plus と Scratch の往復を確認できる。`standard=0` は起動時の切り戻しを再現する。

Editor はこのパッケージを npm から固定して使う。

## 左側ドロワーの表示

Plus 標準配置の左側ドロワーは、スプライト一覧と背景を表示する。ホストは `StandardLayout` に `drawerViews` を渡して、表示する内容を足せる。

```js
<StandardLayout {...props} storage={localStorage} storageKey="twPlusEditorLayout" drawerViews={{
    views: [
        {id: 'project', render: ({locale}) => <ProjectExplorer locale={locale} />, tools: ({locale}) => <ExplorerTools />},
        {id: 'git-history', label: 'Git 履歴', icon: <HistoryIcon />, render: () => <GitHistory />}
    ],
    agents: {renderMenu: ({locale, close}) => <div role="menu">…</div>}
}} />
```

- ドロワーの最上部に、アイコンだけのボタンを 1 行に並べたもの（ドロワーが狭すぎるときだけ折り返す）（`role="toolbar"`、「ドロワーの表示」）が出る。1 スプライト一覧、2 プロジェクトフォルダ、3 Git 履歴、4 AI エージェント。それぞれ日本語か英語の `aria-label` と `title` を持つ。ボタンは、ホストが渡したものだけを出す。スプライト一覧は常に先頭にある。
- 1〜3 は内容を切り替え、選択中のボタンを `aria-pressed` で示す。矢印キーでボタンの間を移る（Tab で止まるのは 1 つ。左右は端で反対側に回り、Home と End は両端へ移る）。Enter と Space で選ぶ。
- `id` は `project` か `git-history`。知らない `id` と、重なった `id` は無視する。`label` と `icon` を省くと、パッケージの名前と、`currentColor` で描く 16 px のアイコンを使う。`render` は選択中だけ呼ぶ。`tools` は、スプライト一覧の検索・ピン・アンドックと同じ位置に出す。検索とアンドックは、スプライト一覧を選んでいるときだけ出る。ピン留めはドロワーそのものの操作なので、どの内容でも出す。ほかの内容を出している間も、GUI の対象ペインは隠したまま残す。
- 4 はメニューを開くボタン（`aria-haspopup="menu"`、`aria-expanded`）。`renderMenu` がメニューの中身を描く。ふつうは `role="menu"` の要素 1 つと、その中の `menuitem` にする。開くと最初の項目に移る。Escape、外側の押下、`close()` で閉じ、ボタンに戻る。ドロワーの内容は切り替えない。
- 選んだ内容は、分割レイアウトと同じ `storage` の `<storageKey>.drawer`（`{"version": 1, "view": "project"}`）に保存する。保存した内容をホストが渡していないときはスプライト一覧に戻り、ホストがまた渡すと復元する。
- `drawerViews` がないとき、または使える内容も `agents` もないときは、ドロワーは変わらない。ボタンを出さず、スプライト一覧を囲む要素も足さない。内容は起動時から渡す。後から最初の内容を足すと、GUI の対象ペインを 1 度作り直す。

試験用ホストの `/example/?standard=1&drawer=1&lang=ja` で、見本の内容を入れたボタンと、パッケージの AI エージェントのメニューを試せる。

### AI エージェントのメニューと設定

`@kubohiroya/turbowarp-plus-editor-workbench/ai-agents` は、4 のボタンのメニューと、その設定のダイアログを渡す。

```tsx
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {createAiAgents} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';

const aiAgents = createAiAgents(React, {styles});
<StandardLayout {...props} drawerViews={{views, agents: aiAgents.drawerMenu}} />
// ほかの場所、たとえば設定のメニューの項目（アイコンは aiAgents.settingsIcon()）から:
aiAgents.openSettings({locale, returnFocus: trigger});
```

- メニューは、メニューに出すことにしたサービスを、アイコンと名前で並べ、区切りのあとに「AI エージェント設定…」を置く。出すサービスがないときは、その項目と短い案内だけを出す。矢印キー、Home、End で項目を移る。サービスを選ぶと、`window.open(url, '_blank', 'noopener,noreferrer')` で開く。
- 用意されたサービスは ChatGPT（`https://chatgpt.com/`）と Claude（`https://claude.ai/new`）。それぞれメニューから外せ、以前の会話などの URL に置き換えられる。URL を空にすると既定に戻る。利用者は、名前と URL で自分のサービスを足し、消せる。URL は `https:` で始まるものだけを受け付け、ほかは欄の下に誤りを出す。アイコンは汎用のもので、用意されたサービスは頭文字入りの吹き出し、自分のサービスは地球儀にする。各サービスのロゴは使わない。
- ダイアログ（`role="dialog"`、`aria-modal`）は React を使わない DOM で、`openAgentSettingsDialog` で開ける。開くと最初の欄に移り、Tab はダイアログの中を回る。Escape かキャンセルで保存せずに閉じ、`returnFocus`、なければ開く前の要素に戻る。
- 設定は `localStorage` の `twPlusAiAgents` に `{"version": 1, "services": [...]}` で保存する。各サービスの `target` は `kind: "url"`。ほかの `kind` は後の段階のためにあけてあり、いまは読み飛ばす。ない・壊れた・誤ったデータは、項目ごとに既定に戻す。

## 検証

`npm test` で配分・縦横比・設定の読み書きを、`npm run test:browser` で独立した試験用ホストを検証する。試験用ホストを手動で開くには、このディレクトリで `npm install` と `python3 -m http.server` を実行し、`/example/` を表示する。

Editor のルートから、`site/source.json` の GUI を `npm run build:pages` でビルドし、`E2E_GUI_ROOT=/absolute/gui-checkout E2E_PATH_PREFIX=/turbowarp-plus-editor/ node --test test/editor-layout.browser.ts` を実行する。同じ GUI をホスト接続なしでビルドしたディレクトリを `E2E_LAYOUT_BARE_BUILD` に渡すと、GUI 単体の動作も検証する。
## 別窓ステージ

`attachStageInput` は、ホストから渡された別ウィンドウの document とキャンバスを使って、入力の購読と解放を管理する。ポインター処理とドラッグ状態の解除はホストのコールバックを使用する。

スプライト編集タブの中のペイン（素材と変数、メッセージ、設定フォーム、セクション切り替えのツールバー）は `@kubohiroya/turbowarp-plus-editor-sprite-panes` に移った。このパッケージはそれらをタブや分割に並べる。以前の配布アーカイブのソース `b0390c3` から移設したウィンドウ部品は、`@kubohiroya/turbowarp-plus-editor-windows` に移った。Scratch GUI の本家実装はこのパッケージに取り込んでいないため、GPL のコードを含まず、GPL のモジュールも import しない。ライセンスは MPL-2.0 とする。MPL-2.0 は GPL を二次ライセンスとして認めるので、GPL-3.0 の Editor に組み込んで配信できる。ソースに「Incompatible With Secondary Licenses」の表示は付けない。付けると Editor に組み込めなくなる。

## デバッガーのタブ

`attachDebuggerPanel(debugger, {document, vm})` は、デバッガーアドオンのウィンドウを Dockview のタブとして開く。ホストはアドオンのウィンドウ要素、アドオン自身の表示切り替え関数、GUI の言語を返す関数を渡す。ワークスペースがパネルを受け付けるときは「デバッガー」タブで開き、タブとデバッガーの開閉を連動させる。受け付けないときは従来どおり浮動ウィンドウのままにする。タブは一時パネルとして扱い、保存するレイアウトには含めない。

`debugger-panel.css` はアドオンのクラス名を上書きするため、ホストはグローバルなスタイルシートとして読み込む。タブと浮動ウィンドウの両方で、アドオン固有の青緑の代わりに GUI のテーマ変数を使う。

## Editor と組み合わせたローカル検証

`npm test` でタブの状態管理、ファイルメニューの操作、既存レイアウトを検証する。
`TW_PLUS_LAYOUT_EDITOR_URL` に、固定済み Scratch GUI と組み合わせた Editor の URL を指定して
`npm run test:browser` を実行すると、既存のタブ列・編集パネル接続で Dockview を検証する。
ファイルメニューの任意接続を備えた GUI を確認する場合は、同じコマンドに
`TW_PLUS_LAYOUT_FILE_MENU_URL` を指定する。

npm への公開は `.github/workflows/release.yml` が行う。`main` への push で `package.json` の版が
npm にまだ無いときだけ、テストを通したうえで公開する。すでにある版では何もしない。認証はトークン
ではなく npm の Trusted Publisher（OIDC）で、`id-token: write` の権限を使う。npm 側の設定には
このワークフローのファイル名をそのまま登録するため、改名するときは npm の設定も合わせる。

Plus 標準配置ではスプライト編集タブを既定で表示する。`twPlusDockviewSpriteTabs=0` で従来の編集表示に戻る。
Editor がファイルメニューの接続口を提供している場合は、各項目のアイコンと「機能拡張の追加」を表示する。
`twPlusExtensionFileMenu=0` で左下のボタンに戻る。起動時のパラメーターを変更したら再読み込みする。

Web 版の Plus 標準配置で `twPlusDockview=1` を付けて起動すると、スプライト編集ペインを左右・上下に分割できます。同じスプライトを複数のペインで開いた場合、表示セクション、コスチュームと音の選択、素材一覧のスクロール位置をペインごとに保持します。変数の値はプロジェクト内で共有され、編集中のペインで変更できます。URL から `twPlusDockview=1` を外して再読み込みすると、通常のスプライトタブに戻ります。

スプライトと背景の編集タブには「コード」「コスチューム / 背景」「音」「変数など」に続いて「メッセージ」がある。
表示は `@kubohiroya/turbowarp-plus-editor-sprite-panes` の `SpriteMessagePane` が担う。
`broadcast_msg` はステージ所有なので、メッセージ名の変更は作品全体に及ぶ。
送受信の判定は `@kubohiroya/turbowarp-plus-editor-project-model` の `messageReference` だけが持ち、Editor の作品内検索も同じ関数を使う。
このパッケージの `./project-messages` は、既存の import のためにそれを再 export している。
