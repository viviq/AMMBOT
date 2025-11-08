import { AppConfig } from './types.js';
import { logger } from './logger.js';

export type FundamentalsData = {
  marketCapUSD?: number;
  priceChange24hPct?: number;
};

/**
 * 启动基础面实时轮询（目前支持 CoinGecko）
 */
export function startFundamentalsPolling(
  cfg: AppConfig,
  tokens: string[],
  onUpdate: (token: string, data: FundamentalsData) => void
) {
  const api = cfg.fundamentalsApi;
  if (!api) {
    logger.info('Fundamentals API not configured or unsupported provider');
    return { stop: () => void 0 };
  }

  // CoinGecko 分支
  if (api.provider === 'coingecko') {
    const idMap = api.coingeckoIds || {};
    const tokensEff = tokens.length > 0 ? tokens : Object.keys(idMap);
    const ids = tokensEff
      .map((t) => idMap[t])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) {
      logger.warn({ tokens: tokensEff }, 'No CoinGecko ids mapped for tokens');
      return { stop: () => void 0 };
    }

    const poll = async () => {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
          ids.join(',')
        )}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Record<string, Record<string, number>>;
        for (const [token, id] of Object.entries(idMap)) {
          if (!tokensEff.includes(token)) continue;
          const entry = data[id];
          if (!entry) continue;
          const marketCapUSD = entry.usd_market_cap;
          const priceChange24hPct = entry.usd_24h_change;
          onUpdate(token, { marketCapUSD, priceChange24hPct });
        }
      } catch (e) {
        logger.warn({ err: e }, 'Fundamentals polling error');
      }
    };

    const intervalMs = (api.pollIntervalSec ?? 300) * 1000;
    const timer = setInterval(poll, intervalMs);
    void poll();
    logger.info({ provider: api.provider, tokens: tokensEff, intervalMs }, 'Fundamentals polling started');
    return { stop: () => clearInterval(timer) };
  }

  // CMC 分支
  if (api.provider === 'cmc') {
    if (!api.apiKey) {
      logger.warn('CMC API key missing');
      return { stop: () => void 0 };
    }
    const symOverride = api.cmcSymbols || {};
    const tokensEff = tokens.length > 0 ? tokens : Object.keys(symOverride);
    const symbolsRaw = tokensEff.map((t) => symOverride[t] || t);
    // 过滤掉CMC不支持的符号（仅允许A-Z0-9），避免400错误
    const symbols = symbolsRaw.filter((s) => /^[A-Z0-9]{2,20}$/.test(s));
    if (symbols.length === 0) {
      logger.warn({ tokens: tokensEff }, 'No symbols available for CMC polling');
      return { stop: () => void 0 };
    }

    const chunk = <T>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const poll = async () => {
      try {
        const chunks = chunk(symbols, 100);
        for (const ch of chunks) {
          const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(ch.join(','))}&convert=USD`;
          logger.info({
            symbolCount: ch.length,
            symbols: ch.slice(0, 5).join(',') + (ch.length > 5 ? '...' : ''),
            apiKeyLength: api.apiKey?.length,
            apiKeyPrefix: api.apiKey?.substring(0, 8)
          }, 'CMC API request');
          const res = await fetch(url, {
            cache: 'no-store',
            headers: { 'X-CMC_PRO_API_KEY': api.apiKey!, Accept: 'application/json' }
          });
          if (!res.ok) {
            const errorBody = await res.text().catch(() => 'Unable to read response');
            logger.error({ status: res.status, body: errorBody }, 'CMC API error response');
            throw new Error(`HTTP ${res.status}`);
          }
          const json = (await res.json()) as {
            data?: Record<string, {
              symbol?: string;
              quote?: { USD?: { market_cap?: number; percent_change_24h?: number } };
            }>;
          };
          const data = json.data || {};
          for (const token of tokensEff) {
            const sym = symOverride[token] || token;
            const entry = data[sym];
            const q = entry?.quote?.USD;
            if (!q) continue;
            const marketCapUSD = q.market_cap;
            const priceChange24hPct = q.percent_change_24h;
            onUpdate(token, { marketCapUSD, priceChange24hPct });
          }
        }
      } catch (e) {
        logger.warn({ err: e }, 'CMC polling error');
      }
    };

    const intervalMs = (api.pollIntervalSec ?? 300) * 1000;
    const timer = setInterval(poll, intervalMs);
    void poll();
    logger.info({ provider: api.provider, tokens: tokensEff, intervalMs }, 'Fundamentals polling started');
    return { stop: () => clearInterval(timer) };
  }

  logger.info({ provider: api.provider }, 'Fundamentals API provider not supported');
  return { stop: () => void 0 };
}
