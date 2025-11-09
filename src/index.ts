import 'dotenv/config';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { connectMarkPriceArrayStream, fetchOpenInterestBatch, fetch24hTickerAll, fetchPerpetualSymbolsUSDT } from './binance.js';
import { FeatureAggregator } from './aggregator/window.js';
import { evaluateRules } from './rules.js';
import { sendTelegram } from './notify/telegram.js';
import { createServer } from './server.js';
import { startFundamentalsPolling, FundamentalsData } from './fundamentals.js';
import { cmcSlugCache } from './cmcSlugCache.js';

async function main() {
  const cfg = loadConfig('config.yaml');
  const agg = new FeatureAggregator(10);

  // 初始化 CMC slug 缓存（用于 Telegram 消息中的 CMC 链接）
  await cmcSlugCache.initialize(cfg.fundamentalsApi?.apiKey, 24);

  // 简易限频与去重：按symbol与全局窗口抑制重复告警
  const lastSentPerSymbol = new Map<string, number>();
  let lastGlobalSent = 0;
  const canNotify = (symbol: string, now: number) => {
    const perSymbolWindowMs = (cfg.rateLimit?.perSymbolWindowSec ?? 0) * 1000;
    const globalWindowMs = (cfg.rateLimit?.globalWindowSec ?? 0) * 1000;
    const lastSymbolTs = lastSentPerSymbol.get(symbol) ?? 0;
    const passSymbol = now - lastSymbolTs >= perSymbolWindowMs;
    const passGlobal = now - lastGlobalSent >= globalWindowMs;
    return passSymbol && passGlobal;
  };
  const markNotified = (symbol: string, now: number) => {
    lastSentPerSymbol.set(symbol, now);
    lastGlobalSent = now;
  };

  // 启动HTTP管理端点
  createServer(cfg);

  // 连接WS，消费价格与资金费率
  const tokenFromSymbol = (symbol: string): string => {
    const bases = ['USDT', 'BUSD', 'USD', 'USDC'];
    for (const b of bases) {
      if (symbol.endsWith(b)) return symbol.slice(0, -b.length);
    }
    return symbol;
  };

  // 运行时基础面数据缓存（优先使用实时采集）
  const fundamentalsLatest = new Map<string, FundamentalsData>();

  // 启动基础面轮询
  const whitelistTokens = (cfg.symbols.whitelist || []).map(tokenFromSymbol);
  let fundamentalsCtl: { stop: () => void } = { stop: () => void 0 };
  const provider = cfg.fundamentalsApi?.provider;
  if (provider === 'cmc' && whitelistTokens.length === 0) {
    // 对于CMC，若未配置白名单，则以币安USDT永续的基础币集合为轮询对象
    fetchPerpetualSymbolsUSDT()
      .then((symbols) => {
        const bases = new Set<string>();
        for (const s of symbols) bases.add(tokenFromSymbol(s));
        const tokens = Array.from(bases);
        fundamentalsCtl = startFundamentalsPolling(cfg, tokens, (token, data) => {
          fundamentalsLatest.set(token, data);
        });
        logger.info({ count: tokens.length }, 'CMC fundamentals tokens derived from Binance perps');
      })
      .catch((e) => logger.warn({ err: e }, 'Failed to derive tokens for CMC fundamentals'));
  } else {
    const mappedTokens = Object.keys(cfg.fundamentalsApi?.coingeckoIds || {});
    const pollingTokens = whitelistTokens.length > 0 ? whitelistTokens : mappedTokens;
    fundamentalsCtl = startFundamentalsPolling(cfg, pollingTokens, (token, data) => {
      fundamentalsLatest.set(token, data);
    });
  }

  // 24小时变化缓存（来自Binance 24hr ticker）
  const ticker24hLatest = new Map<string, number>();
  const tickerPollMs = (cfg.sampling.tickerPollIntervalSec ?? 120) * 1000;
  setInterval(async () => {
    try {
      const all = await fetch24hTickerAll();
      for (const [sym, pct] of Object.entries(all)) {
        ticker24hLatest.set(sym, pct);
      }
    } catch (e) {
      logger.warn({ err: e }, 'Ticker24h polling error');
    }
  }, tickerPollMs);

  connectMarkPriceArrayStream((tick) => {
    if (cfg.symbols.blacklist.includes(tick.symbol)) return;
    agg.onPriceTick(tick);
    const f = agg.features(tick.symbol);
    if (!f) return;
    const token = tokenFromSymbol(f.symbol);
    const dyn = fundamentalsLatest.get(token);
    if (dyn) {
      if (dyn.marketCapUSD !== undefined) f.marketCapUSD = dyn.marketCapUSD;
      if (dyn.priceChange24hPct !== undefined) f.priceChange24hPct = dyn.priceChange24hPct;
    } else {
      const fund = cfg.fundamentals?.[token];
      if (fund) {
        if (fund.marketCapUSD !== undefined) f.marketCapUSD = fund.marketCapUSD;
        if (fund.priceChange24hPct !== undefined) f.priceChange24hPct = fund.priceChange24hPct;
      }
    }
    // 若未能从基础面数据源得到市值，且存在静态流通量与最新价格，则以 流通量 × 标记价格 估算市值
    if (f.marketCapUSD === undefined && f.latestMarkPrice !== undefined) {
      const supply = cfg.fundamentals?.[token]?.circulatingSupply;
      if (typeof supply === 'number' && Number.isFinite(supply) && supply > 0) {
        f.marketCapUSD = supply * f.latestMarkPrice;
      }
    }
    // 若Binance ticker有对应symbol的24小时涨跌，优先生效（单位为%）
    const pct24h = ticker24hLatest.get(f.symbol);
    if (pct24h !== undefined) f.priceChange24hPct = pct24h;
    const decision = evaluateRules(cfg, f);
    if (decision.triggers.length > 0) {
      const now = Date.now();
      if (canNotify(decision.symbol, now)) {
        sendTelegram(cfg, decision)
          .then(() => markNotified(decision.symbol, now))
          .catch((e) => logger.error({ err: e }, 'Telegram send failed'));
      } else {
        logger.info({ symbol: decision.symbol }, 'Notification suppressed by rate limit');
      }
    }
  });

  // 定时轮询OI（分批）
  let oiSymbolCache: string[] = [];
  const symbolsForOi = async (): Promise<string[]> => {
    if (cfg.symbols.whitelist && cfg.symbols.whitelist.length > 0) {
      return cfg.symbols.whitelist;
    }
    if (oiSymbolCache.length === 0) {
      oiSymbolCache = await fetchPerpetualSymbolsUSDT();
      if (oiSymbolCache.length > 0) {
        logger.info({ count: oiSymbolCache.length }, 'Loaded USDT perpetual symbols for OI polling');
      } else {
        logger.warn('No perpetual symbols loaded; OI polling will be skipped');
      }
    }
    return oiSymbolCache;
  };

  setInterval(async () => {
    const all = await symbolsForOi();
    if (all.length === 0) return; // 若未配置白名单，则跳过（生产应从交易所获取列表）
    const batchSize = cfg.sampling.restBatchSize;
    for (let i = 0; i < all.length; i += batchSize) {
      const batch = all.slice(i, i + batchSize);
      const snaps = await fetchOpenInterestBatch(batch);
      for (const s of snaps) {
        if (cfg.symbols.blacklist.includes(s.symbol)) continue;
        agg.onOpenInterest(s);
        const f = agg.features(s.symbol);
        if (!f) continue;
        const token = tokenFromSymbol(f.symbol);
        const dyn = fundamentalsLatest.get(token);
        if (dyn) {
          if (dyn.marketCapUSD !== undefined) f.marketCapUSD = dyn.marketCapUSD;
          if (dyn.priceChange24hPct !== undefined) f.priceChange24hPct = dyn.priceChange24hPct;
        } else {
          const fund = cfg.fundamentals?.[token];
          if (fund) {
            if (fund.marketCapUSD !== undefined) f.marketCapUSD = fund.marketCapUSD;
            if (fund.priceChange24hPct !== undefined) f.priceChange24hPct = fund.priceChange24hPct;
          }
        }
        // 若未能从基础面数据源得到市值，且存在静态流通量与最新价格，则以 流通量 × 标记价格 估算市值
        if (f.marketCapUSD === undefined && f.latestMarkPrice !== undefined) {
          const supply = cfg.fundamentals?.[token]?.circulatingSupply;
          if (typeof supply === 'number' && Number.isFinite(supply) && supply > 0) {
            f.marketCapUSD = supply * f.latestMarkPrice;
          }
        }
        const pct24h = ticker24hLatest.get(f.symbol);
        if (pct24h !== undefined) f.priceChange24hPct = pct24h;
        const decision = evaluateRules(cfg, f);
        if (decision.triggers.length > 0) {
          const now = Date.now();
          if (canNotify(decision.symbol, now)) {
            sendTelegram(cfg, decision)
              .then(() => markNotified(decision.symbol, now))
              .catch((e) => logger.error({ err: e }, 'Telegram send failed'));
          } else {
            logger.info({ symbol: decision.symbol }, 'Notification suppressed by rate limit');
          }
        }
      }
    }
  }, cfg.sampling.oiPollIntervalSec * 1000);
}

main().catch((e) => {
  logger.error({ err: e }, 'Fatal error');
  process.exit(1);
});
