import { scraperService } from './scraper.service';
import { cacheService } from './cache.service';

/**
 * 快活CLUBのスクレイピングスケジューラー
 *
 * 快活CLUBのHP更新タイミング:
 * - 10分間隔で更新（XX:00, XX:10, XX:20, XX:30, XX:40, XX:50）
 * - 実際の更新は各時刻の約2分後（XX:02頃）
 * - 最新データが取得できるのは XX:03 以降
 *
 * スクレイピングタイミング:
 * - XX:04 に実行（例: 23:04, 23:14, 23:24...）
 * - これにより常に最新データを取得
 */
export class SchedulerService {
  private intervals: NodeJS.Timeout[] = [];
  private readonly DEFAULT_STORE_CODES = ['20333']; // デフォルト店舗

  /**
   * スケジューラーを開始
   */
  start(): void {
    console.log('🕐 Scheduler starting...');

    // 起動時に一度実行（キャッシュを warm up）
    console.log('🚀 Running initial scraping...');
    this.executeScraping().catch(err => {
      console.error('Initial scraping failed:', err);
    });

    // 次の XX:04 のタイミングを計算
    const nextScheduledTime = this.getNextScheduledTime();
    const delay = nextScheduledTime.getTime() - Date.now();

    console.log(`⏰ Next scheduled scraping at: ${nextScheduledTime.toLocaleTimeString('ja-JP')}`);
    console.log(`⏱️  Starting in ${Math.floor(delay / 1000)}s`);

    // 定期実行をスケジュール
    setTimeout(() => {
      this.executeScraping();

      // 10分ごとに実行
      const interval = setInterval(() => {
        this.executeScraping();
      }, 10 * 60 * 1000); // 10分

      this.intervals.push(interval);
    }, delay);
  }

  /**
   * 次の XX:04 のタイミングを取得
   */
  private getNextScheduledTime(): Date {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();

    // 現在の10分スロットを計算 (0-9, 10-19, 20-29, ...)
    const currentSlot = Math.floor(currentMinute / 10);

    // 次のスロットのXX:04を計算
    let nextSlot = currentSlot;

    // 現在時刻がXX:04以降の場合、次のスロットに進む
    if (currentMinute % 10 >= 4 || (currentMinute % 10 === 4 && currentSecond > 0)) {
      nextSlot = currentSlot + 1;
    }

    // 次のスロットの分を計算
    let nextMinute = nextSlot * 10 + 4;

    const next = new Date(now);

    if (nextMinute >= 60) {
      // 次の時間に繰り越し
      next.setHours(next.getHours() + 1);
      next.setMinutes(4);
    } else {
      next.setMinutes(nextMinute);
    }

    next.setSeconds(0);
    next.setMilliseconds(0);

    return next;
  }

  /**
   * スクレイピングを実行
   */
  private async executeScraping(): Promise<void> {
    const now = new Date();
    console.log(`\n🔄 Scheduled scraping started at ${now.toLocaleTimeString('ja-JP')}`);

    const storeCodes = this.getStoreCodesFromCache();

    if (storeCodes.length === 0) {
      console.log('📋 No store codes in cache, using default stores');
      storeCodes.push(...this.DEFAULT_STORE_CODES);
    }

    console.log(`📍 Scraping ${storeCodes.length} stores: ${storeCodes.join(', ')}`);

    // 各店舗を並列でスクレイピング
    const promises = storeCodes.map(async (storeCode) => {
      try {
        console.log(`📡 Fetching ${storeCode}...`);
        const data = await scraperService.scrapeWithRetry(storeCode, 2);

        // キャッシュに保存
        cacheService.set(`vacancy:${storeCode}`, data);
        console.log(`✅ ${storeCode} updated successfully`);
      } catch (error) {
        console.error(`❌ Failed to fetch ${storeCode}:`, error);
      }
    });

    await Promise.allSettled(promises);

    console.log(`✨ Scheduled scraping completed at ${new Date().toLocaleTimeString('ja-JP')}\n`);
  }

  /**
   * キャッシュから店舗コードのリストを取得
   * （最近アクセスされた店舗を優先的にスクレイピング）
   */
  private getStoreCodesFromCache(): string[] {
    // キャッシュキーから店舗コードを抽出
    const stats = cacheService.getStats();
    const keys = stats.keys;

    // vacancy: プレフィックスがあるキーから店舗コードを抽出
    const storeCodes = keys
      .filter((key: string) => key.startsWith('vacancy:'))
      .map((key: string) => key.replace('vacancy:', ''));

    return Array.from(new Set(storeCodes)); // 重複を除去
  }

  /**
   * スケジューラーを停止
   */
  stop(): void {
    console.log('🛑 Stopping scheduler...');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }
}

// シングルトンインスタンス
export const schedulerService = new SchedulerService();
