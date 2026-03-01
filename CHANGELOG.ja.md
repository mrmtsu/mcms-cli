# 変更履歴

このプロジェクトにおける注目すべき変更は、このファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に準拠し、
バージョニングは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) に従います。

## [Unreleased]

## [0.5.0] - 2026-03-01

### 追加
- `schema pull --format json-schema` を追加し、microCMS の API スキーマを JSON Schema（draft-07）として出力できるようにした。
- `schema pull --include-extensions` を追加し、`x-microcms-*` 拡張メタデータを含む JSON Schema を出力できるようにした。
- `@mrmtsu/microcms-schema-adapter` を依存に追加し、CLI から直接 JSON Schema 変換を利用できるようにした。
- `schema pull` 向けの e2e テスト、および schema adapter 連携の unit テストを追加した。
- `skills/mcms-cli/references/*` を追加し、セットアップ・安全運用・bulk/import・docs/search の手順をリファレンスとして分割した。

### 変更
- `schema pull --format` の入力検証を追加し、不正値は `INVALID_INPUT` として明示的に失敗させるようにした。
- `spec --json` の `schema pull` オプション定義を更新し、`--format <format>` と `--include-extensions` を公開仕様に反映した。
- `skills/mcms-cli/SKILL.md` を簡潔化し、詳細手順を `references/` 配下へ委譲する構成に整理した。

## [0.4.0] - 2026-02-28

### 追加
- `content export` コマンドを追加し、JSON/CSV 出力と `--all` によるエンドポイント一括エクスポートに対応した。
- `content import` コマンドを追加し、`--upsert`、`--interval`、スキーマベースのバリデーションに対応した。
- `content diff` コマンドを追加し、`--draft-key` を使って公開コンテンツと下書きコンテンツを比較できるようにした。
- `content bulk` コマンドを追加し、JSON 操作ファイルによる `create` / `update` / `delete` / `status` の一括実行に対応した。
- `schema diff` コマンドを追加し、baseline とリモートスキーマの比較、および CI 用の `--exit-code` に対応した。
- `types sync` コマンドを追加し、スキーマ取得と TypeScript 宣言生成を1ステップで実行できるようにした。
- `content bulk --validate-payload` オプションを追加し、bulk 実行時に明示的にスキーマ検証を有効化できるようにした。

### 変更
- `content bulk --dry-run` は API アクセス不要で操作ファイル構造のみ検証するようにし、payload/schema 検証は `--validate-payload`（または `--strict-warnings`）指定時のみ実施するようにした。
- `content bulk` に明示的な `--stop-on-error`（デフォルト動作）を追加し、`--stop-on-error` と `--continue-on-error` の競合指定を拒否するようにした。
- `content export --all` で object API をスキップし、`skipped` メタデータとして報告するようにした（list 型エンドポイントの出力に集中）。
- `content import` / `content bulk` は非 JSON モードで進捗行を出力するようにした。
- 新規コマンド・オプション公開に合わせて、コマンド仕様と補完メタデータを更新した（`content export/import/diff/bulk`, `schema diff`, `types sync`, `content bulk --validate-payload`）。

### 修正
- `content import` のバリデーションエラーメッセージを修正し、dry-run 失敗と非 dry-run の payload 検証失敗を区別できるようにした。
- `content bulk --dry-run` でスキーマ検証を実行した際の request-id 伝播を改善した。

### テスト
- `content export` / `content import` / `content bulk` / `content diff` / `schema diff` / `types sync` の e2e カバレッジを追加・拡張した。
- 新規追加コマンド・オプション（`--stop-on-error`, `--validate-payload`, `types generate --endpoints` など）に対する contract/spec アサーションを追加した。

## [0.3.1] - 2026-02-27

### 追加
- `src/core/api-field-utils.ts` を追加し、スキーマ/型生成と payload バリデーションで共有する API field 抽出・kind 正規化・許可値解析を集約した。
- `content list --all` の安全チェックを追加した（`totalCount` 不整合検出、マージ上限の安全値、ページ上限エラー）。
- Content API HTTP パス統一、`--all` 安全動作、mock file 解決の実行時環境切替、verbose/non-verbose リトライログ挙動に関するテストを追加した。

### 変更
- Content API 操作（`list/get/create/update/delete`）を内部 HTTP レイヤー（`requestJson`）へ統一し、`microcms-js-sdk` の実行時経路を撤廃した。
- コマンド action ハンドラを共有 command-context 配線の型付きシグネチャへリファクタリングし、`actionArgs[...] as ...` パターンを削減した。
- 環境オーバーライド値（`MICROCMS_*_BASE_URL`, `MICROCMS_CONTENT_MOCK_FILE`）を `RuntimeContext` ベースの実行時解決へ移し、テスト容易性と一貫性を向上させた。
- prompt API key 入力を Node の readline キープレス処理で簡素化しつつ、TTY での no-echo 挙動を維持した。
- 型生成が主目的の場合に `wato787/microcms-cli` を案内する README ガイダンスを追加した。

### 修正
- content 操作における delete レスポンス整形を標準化し、JSON エンベロープ互換性を保ちながら request-id 伝播を維持した。
- 意図的に握りつぶすエラー（version 解決フォールバック、keychain 失敗、mock store 読み取りフォールバック）の verbose 診断を改善した。

## [0.3.0] - 2026-02-23

### 追加
- 管理メタデータ取得のための `content meta list` / `content meta get` コマンドを追加した。
- 管理ステータス遷移（`PUBLISH` / `DRAFT`）のための `content status set` コマンドを追加した。
- Management API v2 経由で URL 指定削除を行う `media delete` コマンドを追加した。
- Management API でメンバー詳細を取得する `member get` コマンドを追加した。
- コンテンツ作成者を変更する `content created-by set` コマンドを追加した。

### 変更
- 新しい `content` / `media` / `member` サブコマンドをシェル補完スクリプトに反映した。
- 新規管理操作に合わせて、コマンド仕様および README の例（英日）を拡張した。

### テスト
- `content meta`, `content status`, `content created-by`, `media delete`, `member get` の unit テストを追加した。
- 新規コマンド公開、dry-run 挙動、入力検証を対象に e2e/contract/spec テストを拡張した。

## [0.2.3] - 2026-02-23

### 変更
- `package.json` の discoverability メタデータ（description, keywords, homepage/repository/bugs）を改善した。
- README/README.ja の見出しと導入を整理し、プロジェクト名と導線を明確化した。
- 公式/非公式、インストール経路、命名差分に関する FAQ セクションを英日両 README に追加した。

## [0.2.2] - 2026-02-21

### 追加
- Management API 経由でメディア一覧を取得する `media list` コマンドを追加した。

### 変更
- 開発/CI 向けに `oxlint` / `oxfmt` ベースの `lint` と `format:check` ワークフローを追加した。
- CI が `typecheck` / `test` / `build` 前に `lint` / `format:check` を実行するようにした。

### 修正
- `.gitattributes` で LF 正規化を強化し、クロスプラットフォームでの整形チェック失敗を防止した。

## [0.2.1] - 2026-02-20

### 修正
- Windows で docs MCP コマンド上書き時に JavaScript MCP コマンドを `node` 経由で実行するように修正した。

## [0.2.0] - 2026-02-20

### 追加
- 公式ドキュメントのメタデータ参照用 `docs list` コマンドを追加した。
- 公式ドキュメント本文（Markdown）取得用 `docs get` コマンドを追加した（MCP ソース）。
- CLI 仕様/ドキュメント参照を横断検索できる `search` コマンドを追加した。
- CLI 機能を機械可読で出力する `spec` コマンドを追加した。
- ドキュメント系コマンドに `--source auto|mcp|local` を追加し、自動フォールバック警告を提供するようにした。
- `microcms-document-mcp-server` を同梱し、追加セットアップなしで docs/search を利用可能にした。
- `docs` / `search` / `spec` を API key / service domain 設定なしで実行可能にした。

### 修正
- 改行区切り JSON メッセージを使うサーバーに対する docs/search/spec の MCP トランスポート互換性を改善した。

## [0.1.0] - 2026-02-19

### 追加
- microCMS 向け非公式 `mcms-cli` の初回リリース。
- 安定した `--json` 出力契約と決定的な終了コード。
- プロファイルベース認証解決（`auth profile list|add|use|remove`、グローバル `--profile`）。
- 安全な認証入力オプション（`--api-key-stdin`, `auth login --prompt`）と keychain 保存対応。
- `content list --all` のページネーション統合モード。
- 書き込み操作向け `--dry-run`。
- `--retry` / `--retry-max-delay` と `Retry-After` 対応のリトライ/バックオフ制御。
- 人間向け出力モード（`--plain`, `--table`, `--select`）。
- 動的 endpoint 候補付きシェル補完インストール/アンインストール（`completion install|uninstall`）。
- トラブルシューティング用 `config doctor` コマンド。
- スキーマ取得と型生成コマンド（`schema pull`, `types generate`）。
- 強化されたスキーマ対応 payload バリデーション。
- OSS 向けコミュニティ/セキュリティ文書（`CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates）。

### 修正
- 不正な env/config 入力経路でも `--json` エラーエンベロープと終了コードの安定性を維持した。
- `auth login --profile` が `defaultProfile` を暗黙変更しないよう修正した。
- 不正なローカル設定 JSON を黙って上書きせず、即時失敗するようにした。
- ドキュメント/インストール例を package 名（`@mrmtsu/mcms-cli`）とコマンド命名に整合させた。
