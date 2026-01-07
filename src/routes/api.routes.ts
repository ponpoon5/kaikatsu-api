import { Router } from 'express';
import { vacancyController } from '../controllers/vacancy.controller';

const router = Router();

// 空席情報取得
router.get('/vacancy/:storeCode', (req, res) => vacancyController.getVacancy(req, res));

// キャッシュクリア（開発用）
router.post('/cache/clear', (req, res) => vacancyController.clearCache(req, res));

// キャッシュ統計
router.get('/cache/stats', (req, res) => vacancyController.getCacheStats(req, res));

export default router;
