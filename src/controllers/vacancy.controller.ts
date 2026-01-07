import { Request, Response } from 'express';
import { scraperService } from '../services/scraper.service';
import { cacheService } from '../services/cache.service';
import { ApiResponse, VacancyData } from '../types/vacancy';

export class VacancyController {
  async getVacancy(req: Request, res: Response): Promise<void> {
    try {
      const { storeCode } = req.params;

      // 店舗コードのバリデーション
      if (!storeCode || !/^\d{5}$/.test(storeCode)) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_STORE_CODE',
            message: 'Store code must be a 5-digit number'
          }
        };
        res.status(400).json(errorResponse);
        return;
      }

      const cacheKey = `vacancy:${storeCode}`;

      // noCacheパラメータをチェック
      const noCache = req.query.noCache === 'true';
      console.log(`noCache parameter: ${req.query.noCache}, evaluated as: ${noCache}`);

      // キャッシュをチェック（noCacheがtrueの場合はスキップ）
      if (!noCache) {
        const cachedData = cacheService.get(cacheKey);

        if (cachedData) {
          const cacheAge = cacheService.getCacheAge(cacheKey);
          const response: ApiResponse<VacancyData> = {
            success: true,
            data: cachedData,
            cached: true,
            cacheAge
          };
          res.json(response);
          return;
        }
      }

      // 公式APIから取得を試みる（推奨）
      console.log(`Fetching fresh data for store: ${storeCode}`);
      let vacancyData: VacancyData;
      try {
        vacancyData = await scraperService.fetchVacancyFromAPI(storeCode);
      } catch (apiError) {
        console.warn('Official API failed, falling back to scraping:', apiError);
        // APIが失敗した場合のみスクレイピングにフォールバック
        vacancyData = await scraperService.scrapeWithRetry(storeCode, 3);
      }

      // キャッシュに保存
      cacheService.set(cacheKey, vacancyData);

      const response: ApiResponse<VacancyData> = {
        success: true,
        data: vacancyData,
        cached: false
      };

      res.json(response);
    } catch (error) {
      console.error('Controller error:', error);

      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'SCRAPING_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch vacancy data'
        }
      };

      res.status(500).json(errorResponse);
    }
  }

  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      cacheService.clear();
      res.json({
        success: true,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'CACHE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to clear cache'
        }
      });
    }
  }

  async getCacheStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = cacheService.getStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get cache stats'
        }
      });
    }
  }
}

export const vacancyController = new VacancyController();
