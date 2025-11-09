import { logger } from './logger.js';

/**
 * CMC Slug 缓存管理器
 * 自动从 CoinMarketCap API 获取所有代币的 symbol -> slug 映射
 */

type CmcMapEntry = {
  id: number;
  symbol: string;
  slug: string;
  rank?: number;
};

class CmcSlugCache {
  private cache: Map<string, string> = new Map();
  private apiKey: string | null = null;
  private refreshIntervalMs: number = 24 * 60 * 60 * 1000; // 24小时
  private timer: NodeJS.Timeout | null = null;

  /**
   * 初始化缓存（从 CMC API 获取映射）
   */
  async initialize(apiKey: string | undefined, refreshIntervalHours = 24): Promise<void> {
    if (!apiKey) {
      logger.warn('CMC API key not provided, using fallback slug mapping');
      this.initializeFallbackMapping();
      return;
    }

    this.apiKey = apiKey;
    this.refreshIntervalMs = refreshIntervalHours * 60 * 60 * 1000;

    // 立即加载一次
    await this.refresh();

    // 定期刷新
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);

    logger.info({ cacheSize: this.cache.size, refreshHours: refreshIntervalHours }, 'CMC slug cache initialized');
  }

  /**
   * 刷新缓存（从 CMC API 重新获取）
   */
  private async refresh(): Promise<void> {
    if (!this.apiKey) return;

    try {
      logger.info('Refreshing CMC slug cache from API...');
      const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=5000&sort=cmc_rank';
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'X-CMC_PRO_API_KEY': this.apiKey,
          Accept: 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const json = (await res.json()) as {
        data?: CmcMapEntry[];
        status?: { error_code?: number; error_message?: string };
      };

      if (json.status?.error_code !== 0) {
        throw new Error(`CMC API error: ${json.status?.error_message || 'Unknown error'}`);
      }

      const data = json.data || [];

      // 构建映射表：优先使用排名较高的币种（避免同名符号冲突）
      const tempMap = new Map<string, { slug: string; rank: number }>();
      for (const entry of data) {
        const symbol = entry.symbol.toUpperCase();
        const rank = entry.rank || 999999;
        const existing = tempMap.get(symbol);

        // 如果同一个 symbol 有多个，选择排名更高的（rank 更小的）
        if (!existing || rank < existing.rank) {
          tempMap.set(symbol, { slug: entry.slug, rank });
        }
      }

      // 更新缓存
      this.cache.clear();
      for (const [symbol, { slug }] of tempMap.entries()) {
        this.cache.set(symbol, slug);
      }

      logger.info({ cacheSize: this.cache.size }, 'CMC slug cache refreshed successfully');
    } catch (e) {
      logger.error({ err: e }, 'Failed to refresh CMC slug cache, using existing cache');
      // 如果是首次加载失败，使用 fallback
      if (this.cache.size === 0) {
        this.initializeFallbackMapping();
      }
    }
  }

  /**
   * 初始化 fallback 映射（当无法访问 CMC API 时）
   */
  private initializeFallbackMapping(): void {
    const fallbackMap: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'bnb',
      XRP: 'xrp',
      ADA: 'cardano',
      SOL: 'solana',
      DOGE: 'dogecoin',
      DOT: 'polkadot',
      MATIC: 'polygon',
      LTC: 'litecoin',
      SHIB: 'shiba-inu',
      TRX: 'tron',
      AVAX: 'avalanche',
      UNI: 'uniswap',
      LINK: 'chainlink',
      ATOM: 'cosmos',
      BCH: 'bitcoin-cash',
      ETC: 'ethereum-classic',
      XLM: 'stellar',
      FIL: 'filecoin',
      ARB: 'arbitrum',
      OP: 'optimism',
      SUI: 'sui',
      APT: 'aptos',
      INJ: 'injective-protocol'
    };

    for (const [symbol, slug] of Object.entries(fallbackMap)) {
      this.cache.set(symbol, slug);
    }

    logger.info({ cacheSize: this.cache.size }, 'CMC slug cache initialized with fallback mapping');
  }

  /**
   * 获取代币的 CMC slug
   */
  getSlug(symbol: string): string {
    const upperSymbol = symbol.toUpperCase();
    const slug = this.cache.get(upperSymbol);

    // 如果找到映射，返回 slug
    if (slug) return slug;

    // 否则使用小写的 symbol 作为 fallback
    logger.debug({ symbol }, 'CMC slug not found in cache, using lowercase fallback');
    return symbol.toLowerCase();
  }

  /**
   * 获取 CMC URL
   */
  getCmcUrl(symbol: string): string {
    const slug = this.getSlug(symbol);
    return `https://coinmarketcap.com/currencies/${slug}/`;
  }

  /**
   * 停止定时刷新
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      hasApiKey: !!this.apiKey
    };
  }
}

// 导出单例
export const cmcSlugCache = new CmcSlugCache();
