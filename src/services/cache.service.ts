import NodeCache from 'node-cache';
import { VacancyData } from '../types/vacancy';

export class CacheService {
  private cache: NodeCache;
  private ttl: number;

  constructor(ttlSeconds: number = 900) {
    this.ttl = ttlSeconds;
    this.cache = new NodeCache({
      stdTTL: this.ttl,
      checkperiod: 120, // 2分ごとに期限切れキーをチェック
      useClones: false
    });

    console.log(`Cache initialized with TTL: ${this.ttl}s`);
  }

  set(key: string, value: VacancyData): boolean {
    try {
      const success = this.cache.set(key, value);
      if (success) {
        console.log(`Cache SET: ${key}`);
      }
      return success;
    } catch (error) {
      console.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  get(key: string): VacancyData | undefined {
    try {
      const value = this.cache.get<VacancyData>(key);
      if (value) {
        console.log(`Cache HIT: ${key}`);
      } else {
        console.log(`Cache MISS: ${key}`);
      }
      return value;
    } catch (error) {
      console.error(`Cache GET error for key ${key}:`, error);
      return undefined;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): number {
    return this.cache.del(key);
  }

  clear(): void {
    this.cache.flushAll();
    console.log('Cache cleared');
  }

  getCacheAge(key: string): number | undefined {
    const ttl = this.cache.getTtl(key);
    if (ttl) {
      const now = Date.now();
      const age = this.ttl - Math.floor((ttl - now) / 1000);
      return age;
    }
    return undefined;
  }

  getStats() {
    return this.cache.getStats();
  }
}

// シングルトンインスタンス
const cacheTTL = parseInt(process.env.CACHE_TTL || '900', 10);
export const cacheService = new CacheService(cacheTTL);
