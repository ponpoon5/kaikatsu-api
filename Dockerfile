# Playwrightを含むNode.js環境
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production

# TypeScriptファイルをビルドするために開発依存関係も一時的にインストール
RUN npm install typescript @types/node @types/express @types/cors

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# 開発依存関係を削除
RUN npm prune --production

# ポートを公開
EXPOSE 3000

# アプリケーションを起動
CMD ["npm", "start"]
