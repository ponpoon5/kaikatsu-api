export interface VacancyData {
  storeCode: string;
  storeName: string;
  dartVacancy: {
    available: number;
    total: number;
    status: 'vacant' | 'crowded' | 'full' | 'unknown';
  };
  lastUpdated: string; // ISO 8601 format
  fetchedAt: string;   // ISO 8601 format
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  cached?: boolean;
  cacheAge?: number; // seconds
}
