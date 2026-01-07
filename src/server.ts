import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes';
import { scraperService } from './services/scraper.service';
import { schedulerService } from './services/scheduler.service';

// 環境変数を読み込み
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// セキュリティミドルウェア
app.use(helmet());

// CORS設定（AndroidアプリからのアクセスをAllowするため全て許可）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ボディパーサー
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// レート制限
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1分
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10), // 10リクエスト
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// APIルートにレート制限を適用
app.use('/api', limiter);

// ルート
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Kaikatsu Vacancy API',
    version: '1.0.0',
    endpoints: {
      'GET /api/vacancy/:storeCode': 'Get vacancy information for a store',
      'GET /api/cache/stats': 'Get cache statistics',
      'POST /api/cache/clear': 'Clear cache (development only)'
    }
  });
});

// APIルート
app.use('/api', apiRoutes);

// 404ハンドラー
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// エラーハンドラー
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message
    }
  });
});

// グレースフルシャットダウン
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  schedulerService.stop();
  await scraperService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  schedulerService.stop();
  await scraperService.close();
  process.exit(0);
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Kaikatsu Vacancy API Server          ║
╠════════════════════════════════════════╣
║   Port: ${PORT}                     ║
║   Environment: ${process.env.NODE_ENV || 'development'}          ║
║   Cache TTL: ${process.env.CACHE_TTL || 900}s                ║
╚════════════════════════════════════════╝
  `);
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/vacancy/:storeCode`);

  // 定期スクレイピングスケジューラーを開始
  schedulerService.start();
});

export default app;
