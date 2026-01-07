import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { VacancyData } from '../types/vacancy';

// 快活CLUB公式APIのエンドポイント
const KAIKATSU_API_URL = 'https://jx5rl6ilkg.execute-api.ap-northeast-1.amazonaws.com/prd/empty_seat';

export class ScraperService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 快活CLUB公式APIから空席情報を取得（推奨）
   */
  async fetchVacancyFromAPI(storeCode: string): Promise<VacancyData> {
    try {
      console.log(`Fetching from official API: ${KAIKATSU_API_URL}?store_cd=${storeCode}`);

      const response = await axios.get(KAIKATSU_API_URL, {
        params: { store_cd: storeCode },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Referer': `https://www.kaikatsu.jp/shop/detail/vacancy.html?store_code=${storeCode}`,
          'Origin': 'https://www.kaikatsu.jp',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site'
        }
      });

      const data = response.data;

      if (data.status !== 0) {
        throw new Error(`API returned error status: ${data.status}`);
      }

      // ダーツ情報を探す
      const dartInfo = data.seat_type?.find((seat: any) =>
        seat.seat_name === 'ダーツ' || seat.category_id === '10'
      );

      let dartVacancy: VacancyData['dartVacancy'];

      if (dartInfo) {
        const available = this.parseSeatStatus(dartInfo.seat_status);
        const statusNo = parseInt(dartInfo.status_no, 10);

        dartVacancy = {
          available,
          total: available > 0 ? available : 0, // APIは合計台数を提供しないため、availableを使用
          status: this.mapStatusNo(statusNo)
        };
      } else {
        dartVacancy = {
          available: 0,
          total: 0,
          status: 'unknown'
        };
      }

      // APIレスポンスからlastUpdatedを取得（店舗側の更新時刻）
      let lastUpdated = new Date().toISOString();
      if (data.update_time) {
        try {
          const updateDate = new Date(data.update_time);
          if (!isNaN(updateDate.getTime())) {
            lastUpdated = updateDate.toISOString();
          }
        } catch (e) {
          console.warn('Failed to parse update_time:', data.update_time);
        }
      }

      return {
        storeCode,
        storeName: data.store_name || '快活CLUB',
        dartVacancy,
        lastUpdated,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('API fetch error:', error);
      throw error;
    }
  }

  /**
   * 座席ステータス文字列から数値を抽出
   * 例: "残3席" -> 3, "満席" -> 0, "残10席以上" -> 10
   */
  private parseSeatStatus(status: string): number {
    if (status === '満席' || status === '×') {
      return 0;
    }

    const match = status.match(/残?(\d+)席/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 0;
  }

  /**
   * status_noからステータス文字列にマップ
   */
  private mapStatusNo(statusNo: number): 'vacant' | 'crowded' | 'full' | 'unknown' {
    switch (statusNo) {
      case 1:
        return 'vacant'; // 空席あり
      case 2:
        return 'crowded'; // 混雑
      case 3:
        return 'crowded'; // 残りわずか
      case 4:
        return 'full'; // 満席
      default:
        return 'unknown';
    }
  }

  /**
   * Playwrightを使ったスクレイピング（フォールバック用）
   */
  async scrapeVacancy(storeCode: string): Promise<VacancyData> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();

    // APIリクエストをキャプチャ
    const apiRequests: Array<{ url: string; response?: any }> = [];
    page.on('response', async (response) => {
      const url = response.url();
      // JSONレスポンスと思われるものだけをキャプチャ
      if (url.includes('vacancy') || url.includes('api') || url.includes('.json') || url.includes('.js')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json') || url.endsWith('.json')) {
            const data = await response.json();
            apiRequests.push({ url, response: data });
            console.log(`📡 API Request captured: ${url}`);
          } else if (url.endsWith('.js') && (url.includes('vacancy') || url.includes('shop'))) {
            console.log(`📜 JS File loaded: ${url}`);
          }
        } catch (error) {
          // JSONパースできない場合は無視
        }
      }
    });

    try {
      const url = `${process.env.KAIKATSU_BASE_URL || 'https://www.kaikatsu.jp'}/shop/detail/vacancy.html?store_code=${storeCode}`;
      console.log(`Scraping URL: ${url}`);

      // ページに移動
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // 空席情報が読み込まれるまで待機
      try {
        await page.waitForSelector('#vacancy-content', { timeout: 10000 });
        // vacancy-contentに子要素が追加されるまで待機
        await page.waitForFunction(
          `() => {
            const content = document.querySelector('#vacancy-content');
            return content && content.children.length > 0;
          }`,
          { timeout: 15000 }
        );
        console.log('Vacancy content loaded successfully');
      } catch (error) {
        console.warn('Timeout waiting for vacancy content, proceeding anyway');
      }

      // 追加の待機時間
      await page.waitForTimeout(2000);

      // HTMLコンテンツを取得
      const html = await page.content();

      // デバッグ用: HTMLとAPIリクエストを保存（開発環境のみ）
      if (process.env.NODE_ENV === 'development') {
        const fs = require('fs');
        const debugDir = './debug';
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir);
        }
        fs.writeFileSync(`${debugDir}/scraped-${storeCode}.html`, html, 'utf-8');
        console.log(`HTML saved to ${debugDir}/scraped-${storeCode}.html`);

        // キャプチャしたAPIリクエストを保存
        if (apiRequests.length > 0) {
          fs.writeFileSync(
            `${debugDir}/api-requests-${storeCode}.json`,
            JSON.stringify(apiRequests, null, 2),
            'utf-8'
          );
          console.log(`📡 ${apiRequests.length} API requests saved to ${debugDir}/api-requests-${storeCode}.json`);
        } else {
          console.log('⚠️  No API requests captured');
        }
      }

      // キャプチャしたAPIレスポンスから直接データを取得（優先）
      const apiResponse = apiRequests.find(req =>
        req.url.includes('empty_seat')
      );

      if (apiResponse && apiResponse.response) {
        console.log('✅ Using captured API response');
        const data = apiResponse.response;
        console.log('📊 Full API response:', JSON.stringify(data, null, 2));

        // ダーツ情報を探す
        const dartInfo = data.seat_type?.find((seat: any) =>
          seat.seat_name === 'ダーツ' || seat.category_id === '10'
        );

        let dartVacancy: VacancyData['dartVacancy'];

        if (dartInfo) {
          const available = this.parseSeatStatus(dartInfo.seat_status);
          const statusNo = parseInt(dartInfo.status_no, 10);

          dartVacancy = {
            available,
            total: available > 0 ? available : 0,
            status: this.mapStatusNo(statusNo)
          };
          console.log(`📊 Dart status: ${dartInfo.seat_status} (${available} available)`);
        } else {
          dartVacancy = {
            available: 0,
            total: 0,
            status: 'unknown'
          };
          console.log('⚠️  Dart info not found in API response');
        }

        // APIレスポンスからlastUpdatedを取得（店舗側の更新時刻）
        let lastUpdated = new Date().toISOString();
        if (data.update_time) {
          // update_timeが存在する場合、ISO形式に変換
          try {
            const updateDate = new Date(data.update_time);
            if (!isNaN(updateDate.getTime())) {
              lastUpdated = updateDate.toISOString();
            }
          } catch (e) {
            console.warn('Failed to parse update_time:', data.update_time);
          }
        }

        // HTMLから店舗名を抽出
        const $ = cheerio.load(html);
        const storeName = this.extractStoreName($, storeCode) || data.store_name || '快活CLUB';
        console.log(`📍 Store name: ${storeName}`);

        const vacancyData: VacancyData = {
          storeCode,
          storeName,
          dartVacancy,
          lastUpdated,
          fetchedAt: new Date().toISOString()
        };

        console.log('API data:', vacancyData);
        return vacancyData;
      }

      // APIレスポンスが取得できなかった場合、HTMLパースにフォールバック
      console.log('⚠️  API response not captured, falling back to HTML parsing');

      // Cheerioでパース
      const $ = cheerio.load(html);

      // 店舗名を取得
      const storeName = this.extractStoreName($, storeCode);

      // ダーツ空席情報を取得
      const dartVacancy = this.extractDartVacancy($);

      // 最終更新時刻を取得
      const lastUpdated = this.extractLastUpdated($);

      const vacancyData: VacancyData = {
        storeCode,
        storeName,
        dartVacancy,
        lastUpdated,
        fetchedAt: new Date().toISOString()
      };

      console.log('Scraped data:', vacancyData);

      return vacancyData;
    } catch (error) {
      console.error('Scraping error:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * 店舗コードから店舗名を取得
   */
  private getStoreNameByCode(storeCode: string): string {
    const storeMap: { [key: string]: string } = {
      '20333': '快活CLUB 16号相模原大野台店'
      // 必要に応じて他の店舗を追加
    };

    return storeMap[storeCode] || '快活CLUB';
  }

  private extractStoreName($: cheerio.CheerioAPI, storeCode: string): string {
    // 店舗コードマッピングから取得を優先
    const mappedName = this.getStoreNameByCode(storeCode);
    if (mappedName !== '快活CLUB') {
      console.log(`📍 Store name from mapping: ${mappedName}`);
      return mappedName;
    }

    // JavaScriptからstore_nameを抽出を試みる
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const scriptContent = $(script).html() || '';

      // store_name = "..." のパターンを探す
      const storeNameMatch = scriptContent.match(/store_name\s*[=:]\s*["']([^"']+)["']/);
      if (storeNameMatch) {
        const storeName = storeNameMatch[1].trim();
        if (storeName && storeName !== '快活CLUB') {
          console.log(`Found store name in JavaScript: ${storeName}`);
          return storeName;
        }
      }

      // storeName: "..." のパターンを探す
      const storeNameMatch2 = scriptContent.match(/storeName\s*[=:]\s*["']([^"']+)["']/);
      if (storeNameMatch2) {
        const storeName = storeNameMatch2[1].trim();
        if (storeName && storeName !== '快活CLUB') {
          console.log(`Found storeName in JavaScript: ${storeName}`);
          return storeName;
        }
      }
    }

    // 複数のセレクター戦略を試す
    const selectors = [
      '.shop-name',
      '.store-name',
      'h1',
      '.page-title',
      '[data-store-name]',
      '.shopName',
      '#storeName',
      '#shopName'
    ];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text && text !== '快活CLUB' && !text.includes('空席照会')) {
          console.log(`Found store name in selector ${selector}: ${text}`);
          return text;
        }
      }
    }

    // タイトルから抽出を試みる
    const title = $('title').text();
    if (title) {
      const match = title.match(/(.+?)[\s|｜]/);
      if (match) {
        const storeName = match[1].trim();
        if (storeName !== '快活CLUB') {
          console.log(`Found store name in title: ${storeName}`);
          return storeName;
        }
      }
    }

    console.log('Store name not found, using default: 快活CLUB');
    return '快活CLUB';
  }

  private extractDartVacancy($: cheerio.CheerioAPI): VacancyData['dartVacancy'] {
    // 複数のセレクター戦略
    const selectors = [
      '.dart-vacancy',
      '[data-type="dart"]',
      '.vacancy-dart',
      '#dartVacancy'
    ];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text();

        // "3台" や "3 / 8台" のようなパターンをパース
        const availableMatch = text.match(/(\d+)[\s]*[台]/);
        const totalMatch = text.match(/\/[\s]*(\d+)[\s]*台/) || text.match(/全(\d+)[\s]*台/);

        if (availableMatch) {
          const available = parseInt(availableMatch[1], 10);
          const total = totalMatch ? parseInt(totalMatch[1], 10) : available;

          return {
            available,
            total,
            status: this.determineStatus(available, total)
          };
        }
      }
    }

    // テーブルやリストから探す
    const rows = $('tr, li').toArray();
    for (const row of rows) {
      const rowText = $(row).text();
      if (rowText.includes('ダーツ') || rowText.includes('DARTS')) {
        const availableMatch = rowText.match(/(\d+)[\s]*台/);
        if (availableMatch) {
          const available = parseInt(availableMatch[1], 10);
          return {
            available,
            total: available,
            status: this.determineStatus(available, available)
          };
        }
      }
    }

    // デフォルト値
    return {
      available: 0,
      total: 0,
      status: 'unknown'
    };
  }

  private extractLastUpdated($: cheerio.CheerioAPI): string {
    const selectors = [
      '.last-updated',
      '.update-time',
      '[data-last-updated]',
      '.vacancy-time'
    ];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text) {
          // 時刻をパース（例：「10:30更新」「更新: 10:30」）
          const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            const now = new Date();
            now.setHours(parseInt(timeMatch[1], 10));
            now.setMinutes(parseInt(timeMatch[2], 10));
            now.setSeconds(0);
            now.setMilliseconds(0);
            return now.toISOString();
          }
        }
      }
    }

    // 見つからない場合は現在時刻を返す
    return new Date().toISOString();
  }

  private determineStatus(available: number, total: number): 'vacant' | 'crowded' | 'full' | 'unknown' {
    if (total === 0) {
      return 'unknown';
    }

    const ratio = available / total;

    if (ratio === 0) {
      return 'full';
    } else if (ratio < 0.3) {
      return 'crowded';
    } else {
      return 'vacant';
    }
  }

  async scrapeWithRetry(storeCode: string, maxRetries: number = 3): Promise<VacancyData> {
    // Playwrightでページを開きながらAPIレスポンスをキャプチャ
    // これにより正規のブラウザリクエストとして扱われ、403エラーを回避
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching attempt ${attempt}/${maxRetries}`);
        const data = await this.scrapeVacancy(storeCode);
        return data;
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to fetch vacancy data after all retries');
  }
}

// シングルトンインスタンス
export const scraperService = new ScraperService();
