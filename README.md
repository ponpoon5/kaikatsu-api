# Kaikatsu Vacancy API

快活CLUBの空席情報を取得するバックエンドAPIサーバー

## 機能

- Playwrightによる動的Webスクレイピング
- 15分間のキャッシング（レート制限対策）
- リトライロジック（3回まで）
- CORS対応
- レート制限（1分あたり10リクエスト）
- セキュリティヘッダー（Helmet.js）

## セットアップ

### 前提条件

- Node.js v20.x以上
- npm v11.x以上

### インストール

```bash
# 依存関係のインストール
npm install

# Playwrightブラウザのインストール
npx playwright install chromium

# 環境変数の設定
cp .env.example .env
```

### 環境変数

`.env`ファイルを編集して設定を調整できます：

```env
PORT=3000
NODE_ENV=development
KAIKATSU_BASE_URL=https://www.kaikatsu.jp
CACHE_TTL=900
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
LOG_LEVEL=info
```

## 開発

```bash
# 開発モード（ホットリロード）
npm run dev

# ビルド
npm run build

# 本番モード
npm start
```

## APIエンドポイント

### GET /api/vacancy/:storeCode

店舗の空席情報を取得します。

**パラメータ:**
- `storeCode`: 5桁の店舗コード（例：20352）

**レスポンス例:**

```json
{
  "success": true,
  "data": {
    "storeCode": "20352",
    "storeName": "快活CLUB ○○店",
    "dartVacancy": {
      "available": 3,
      "total": 8,
      "status": "vacant"
    },
    "lastUpdated": "2026-01-04T10:30:00+09:00",
    "fetchedAt": "2026-01-04T10:31:15+09:00"
  },
  "cached": true,
  "cacheAge": 75
}
```

### GET /api/cache/stats

キャッシュの統計情報を取得します。

### POST /api/cache/clear

キャッシュをクリアします（開発用）。

## 技術スタック

- **Node.js**: ランタイム
- **Express**: Webフレームワーク
- **TypeScript**: 型安全性
- **Playwright**: ヘッドレスブラウザ
- **Cheerio**: HTMLパーサー
- **node-cache**: インメモリキャッシュ
- **Helmet**: セキュリティヘッダー
- **express-rate-limit**: レート制限

## アーキテクチャ

```
Client → Express Server → Cache Service → Scraper Service → 快活CLUBサイト
                        ↓
                    (キャッシュヒット時)
                        ↓
                    クライアントへ返却
```

## ライセンス

ISC
