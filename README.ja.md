# mcms-cli

[English](./README.md) | 日本語

> 非公式プロジェクトです。このCLIは microCMS 公式とは無関係であり、承認・運営されていません。

`--json` の安定出力と終了コード設計を備えた、microCMS向けの AI/CI フレンドリー CLI です。

## 命名の整理

- GitHub リポジトリ名: `mcms-cli`
- npm パッケージ名: `@mrmtsu/mcms-cli`
- 実際に実行するコマンド名: `microcms`
- ローカル保存時の識別子（configディレクトリ / keychain service）: `mcms-cli`

`microcms` を実行コマンド名にしているのは可読性のためです。  
非公式であることは README 先頭に明記しています。

## インストール

```bash
npm i -g @mrmtsu/mcms-cli
# or
npx @mrmtsu/mcms-cli --help
```

## FAQ

### これは microCMS 公式の CLI ですか？

いいえ。これは非公式のコミュニティ製プロジェクトで、microCMS 公式とは無関係です。

### 最短でインストールするには？

`npm i -g @mrmtsu/mcms-cli` を実行し、`microcms --help` で確認できます。

### `mcms-cli` / `@mrmtsu/mcms-cli` / `microcms` の違いは？

`mcms-cli` はリポジトリ/ローカル識別子、`@mrmtsu/mcms-cli` は npm パッケージ名、`microcms` は実行コマンド名です。

## 認証

現状は API キー認証のみです（OAuth は未対応）。

```bash
# CI / 非対話実行の推奨:
export MICROCMS_SERVICE_DOMAIN=<service-domain>
export MICROCMS_API_KEY=<api-key>

# 任意: named profile
microcms auth profile add <profile-name> --service-domain <service-domain> --set-default
microcms auth profile list --json
# 注意: profile add は service domain のみ保存します。API キーは別途 login が必要です。
printf '%s' '<api-key>' | microcms auth login --profile <profile-name> --api-key-stdin

# キーチェーン保存:
printf '%s' '<api-key>' | microcms auth login --service-domain <service-domain> --api-key-stdin
# TTY 対話入力（非表示）:
microcms auth login --service-domain <service-domain> --prompt
microcms auth status --json
```

API キー解決順:
1. `--api-key` / `--api-key-stdin`
2. `MICROCMS_API_KEY`
3. 選択中 profile の OS キーチェーン
4. 解決済み service domain の OS キーチェーンエントリ

service domain 解決順:
1. `--service-domain`
2. `MICROCMS_SERVICE_DOMAIN`
3. config の選択 profile（`--profile`, `MICROCMS_PROFILE`, default profile）
4. config ファイル値（`$XDG_CONFIG_HOME/mcms-cli/config.json`）

## コマンド

```bash
microcms api list --json
microcms api info <endpoint> --json
microcms member get <memberId> --json

microcms content list <endpoint> --json
microcms content list <endpoint> --all --json
microcms content get <endpoint> <id> --json
microcms content meta list <endpoint> --json
microcms content meta get <endpoint> <id> --json
microcms content status set <endpoint> <id> --status PUBLISH --json
microcms content created-by set <endpoint> <id> --member <memberId> --json
microcms content create <endpoint> --file payload.json --json
microcms content create <endpoint> --file payload.json --dry-run --json
microcms content update <endpoint> <id> --file payload.json --json
microcms content delete <endpoint> <id> --json

microcms media list --json
microcms media list --limit 20 --image-only --file-name logo --json
microcms media list --token <token> --json
microcms media upload <path> --json
microcms media upload <path> --dry-run --json
microcms media delete --url <media-url> --json
microcms validate <endpoint> --file payload.json --json
microcms docs list --source auto --json
microcms docs get --category content-api --file "コンテンツ一覧取得API.md" --json
microcms search "content list" --scope all --json
microcms spec --json

microcms schema pull --out microcms-schema.json --json
microcms types generate --schema microcms-schema.json --out microcms-types.d.ts --json

microcms config doctor --json
microcms completion install zsh --json
microcms completion uninstall --json

microcms auth profile list --json
microcms auth profile add <name> --service-domain <service> [--set-default] --json
microcms auth profile use <name> --json
microcms auth profile remove <name> --json
```

`validate` は API メタデータが取得できる場合、required/unknown/type/enum 相当チェックを行います。

## グローバルオプション

- `--json`
- `--plain`
- `--table`
- `--select <fields>`
- `--profile <name>`
- `--service-domain <serviceDomain>`
- `--api-key <apiKey>`（非推奨: シェル履歴/プロセス一覧に露出しうる）
- `--api-key-stdin`
- `--timeout <ms>`
- `--retry <count>`
- `--retry-max-delay <ms>`
- `--verbose`
- `--no-color`

補完では `microcms completion endpoints` を使って endpoint 候補を動的取得します。
`--retry` はデフォルトで retry-safe なリクエスト（GET）に適用されます。

## JSON 契約 (v0)

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": null,
    "version": "0.x"
  }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "...",
    "retryable": false
  },
  "meta": {
    "requestId": null,
    "version": "0.x"
  }
}
```

`error.details` は `--verbose` 指定時のみ含まれます。

## 終了コード

- `0`: success
- `2`: invalid input
- `3`: auth error
- `4`: permission error
- `5`: network/timeout
- `6`: conflict
- `1`: unknown error

## 開発

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

## 補足

- `api list/info` と `media list/upload` は microCMS Management API を利用します。
- Management API base URL のデフォルト: `https://<serviceDomain>.microcms-management.io`
- `MICROCMS_MANAGEMENT_API_BASE_URL` で上書き可能です。
- Content API base URL: `https://<serviceDomain>.microcms.io`
- `MICROCMS_CONTENT_API_BASE_URL` で上書き可能です（主にテスト用途）。
- ネットワーク不要の contract テストでは `MICROCMS_CONTENT_MOCK_FILE` を使えます。
- `MICROCMS_*_BASE_URL` の override 先は localhost または microcms ドメインのみ許可します。
- ドキュメント系コマンドは、同梱された `microcms-document-mcp-server` を既定で利用します（追加セットアップ不要）。
- `docs` / `search` / `spec` は `MICROCMS_API_KEY` や `MICROCMS_SERVICE_DOMAIN` なしで実行できます。
- 必要に応じて `MICROCMS_DOC_MCP_COMMAND` で実行コマンドを上書きできます。

## 免責事項

- 本プロジェクトは非公式のコミュニティ製ツールであり、microCMS 公式とは無関係です。
- 本ソフトウェアは MIT License の下で「現状有姿（as is）」で提供され、いかなる保証もありません。
- 本番利用前に、必ずご自身の環境で検証し、必要なバックアップを取得してください。
- API キーの管理および本CLIで実行した操作の責任は利用者にあります。

## OSS ドキュメント

- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
