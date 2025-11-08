/**
 * 公共类型定义
 */
export type SymbolPair = string; // 如 BTCUSDT

export interface AppConfig {
  thresholds: {
    priceChangePct10m: number;
    oiChangePct10m: number;
    fundingRateLt: number;
  };
  symbols: {
    blacklist: SymbolPair[];
    whitelist?: SymbolPair[];
  };
  sampling: {
    wsIntervalSec: number;
    oiPollIntervalSec: number;
    restBatchSize: number;
    /** 可选：Binance 24h ticker轮询间隔 */
    tickerPollIntervalSec?: number;
  };
  rateLimit: {
    perSymbolWindowSec: number;
    globalWindowSec: number;
  };
  telegram: {
    botToken: string;
    chatIds: string[];
  };
  /** 可选：基础面数据（通过配置或外部采集填充） */
  fundamentals?: Record<string, {
    marketCapUSD?: number;
    priceChange24hPct?: number;
    /** 可选：流通数量（用于以价格估算市值） */
    circulatingSupply?: number;
  }>;
  /** 可选：外部实时基础面采集配置 */
  fundamentalsApi?: {
    provider: 'coingecko' | 'cmc';
    pollIntervalSec?: number;
    /** token符号到CoinGecko id映射，如 { BTC: 'bitcoin' } */
    coingeckoIds?: Record<string, string>;
    /** CMC API Key（仅在 provider=cmc 时需要） */
    apiKey?: string;
    /** token符号到CMC查询用符号的覆盖，如 { BNB: 'BNB' } */
    cmcSymbols?: Record<string, string>;
  };
}

export interface PriceTick {
  symbol: SymbolPair;
  ts: number; // epoch ms
  markPrice: number;
  fundingRate?: number;
}

export interface OpenInterestSnapshot {
  symbol: SymbolPair;
  ts: number; // epoch ms
  openInterest: number;
}

export interface WindowFeatures {
  symbol: SymbolPair;
  ts: number; // epoch ms (window end)
  priceChangePct10m?: number;
  oiChangePct10m?: number;
  fundingRate?: number;
  latestMarkPrice?: number;
  latestOpenInterest?: number;
  windowSeconds?: number;
  marketCapUSD?: number;
  priceChange24hPct?: number;
}

export interface DecisionResult {
  symbol: SymbolPair;
  ts: number;
  triggers: Array<'PRICE' | 'OI' | 'FUNDING'>;
  features: WindowFeatures;
  suppressed: boolean;
}
