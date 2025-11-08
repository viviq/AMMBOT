import { logger } from './logger.js';
import { OpenInterestSnapshot, PriceTick, SymbolPair } from './types.js';

const BASE_WS = 'wss://fstream.binance.com/stream?streams=!markPrice@arr';
const BASE_REST = 'https://fapi.binance.com';

/**
 * 连接全市场标记价格数组流并分发价格与资金费率（优先使用全局WebSocket，失败时尝试动态导入ws）
 */
/**
 * 连接全市场标记价格数组流并分发价格与资金费率（优先使用全局WebSocket，失败时尝试动态导入ws）
 * @param onTick 回调：接收解析后的价格/资金费率事件
 * @returns WebSocket 实例（Node ws 或 浏览器 WebSocket）
 */
export async function connectMarkPriceArrayStream(onTick: (tick: PriceTick) => void): Promise<unknown> {
  type WSNode = {
    on(event: 'message', listener: (data: unknown) => void): void;
    on(event: 'close', listener: () => void): void;
    on(event: 'error', listener: (err: unknown) => void): void;
  };
  type WSBrowser = {
    onmessage: ((ev: { data: unknown }) => void) | null;
    onclose: (() => void) | null;
    onerror: ((err: unknown) => void) | null;
  };
  type WebSocketLike = WSNode | WSBrowser;
  type WebSocketCtor = new (url: string) => WebSocketLike;

  let WSImpl: WebSocketCtor | undefined = (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;
  if (!WSImpl) {
    try {
      const mod = await import('ws');
      const modObj = mod as unknown as Record<string, unknown>;
      const def = modObj.default;
      if (typeof def === 'function') {
        WSImpl = def as WebSocketCtor;
      } else {
        WSImpl = mod as unknown as WebSocketCtor;
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to load WebSocket implementation');
      throw e;
    }
  }
  const ws: WebSocketLike = new WSImpl(BASE_WS);

  const handleMessage = (raw: unknown) => {
    try {
      const parsed = JSON.parse(String(raw));
      const arr = parsed?.data as unknown;
      if (Array.isArray(arr)) {
        const ts = Date.now();
        for (const item of arr as Array<Record<string, unknown>>) {
          const symbol = String(item.s) as SymbolPair;
          const markPrice = Number(item.p);
          const fundingRate = item.r !== undefined ? Number(item.r as unknown) : undefined;
          if (!Number.isFinite(markPrice)) continue;
          onTick({ symbol, ts, markPrice, fundingRate });
        }
      }
    } catch (e) {
      logger.warn({ err: e }, 'WS parse error');
    }
  };

  if ('on' in ws) {
    const n = ws as WSNode;
    n.on('message', handleMessage);
    n.on('close', () => logger.warn('WS closed'));
    n.on('error', (e: unknown) => logger.error({ err: e }, 'WS error'));
  } else {
    const b = ws as WSBrowser;
    b.onmessage = (ev: { data: unknown }) => handleMessage(ev.data);
    b.onclose = () => logger.warn('WS closed');
    b.onerror = (e: unknown) => logger.error({ err: e }, 'WS error');
  }
  return ws;
}

/**
 * 批量轮询持仓量（open interest），按符号列表分批请求
 */
/**
 * 批量轮询持仓量（open interest），按符号列表分批请求
 * @param symbols 合约符号列表
 * @returns OpenInterest 快照数组
 */
export async function fetchOpenInterestBatch(symbols: SymbolPair[]): Promise<OpenInterestSnapshot[]> {
  const ts = Date.now();
  const results: OpenInterestSnapshot[] = [];
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = `${BASE_REST}/fapi/v1/openInterest?symbol=${symbol}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const oi = Number(data?.openInterest);
        if (Number.isFinite(oi)) {
          results.push({ symbol, ts, openInterest: oi });
        }
      } catch (e) {
        logger.warn({ symbol, err: e }, 'OpenInterest fetch error');
      }
    })
  );
  return results;
}

/**
 * 获取USDT本位永续合约的交易对列表（TRADING状态）
 */
export async function fetchPerpetualSymbolsUSDT(): Promise<SymbolPair[]> {
  try {
    const url = `${BASE_REST}/fapi/v1/exchangeInfo`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { symbols?: Array<Record<string, unknown>> };
    const out: SymbolPair[] = [];
    for (const s of data.symbols || []) {
      const status = String(s.status || '');
      const contractType = String(s.contractType || '');
      const symbol = String(s.symbol || '');
      const quoteAsset = String(s.quoteAsset || '');
      if (status === 'TRADING' && contractType === 'PERPETUAL' && quoteAsset === 'USDT') {
        out.push(symbol as SymbolPair);
      }
    }
    return out;
  } catch (e) {
    logger.warn({ err: e }, 'Perpetual symbols fetch error');
    return [];
  }
}

/**
 * 拉取全市场的24小时ticker变化（返回映射：symbol -> priceChangePercent）
 */
export async function fetch24hTickerAll(): Promise<Record<SymbolPair, number>> {
  try {
    const url = `${BASE_REST}/fapi/v1/ticker/24hr`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()) as Array<Record<string, unknown>>;
    const map: Record<SymbolPair, number> = {};
    for (const it of arr) {
      const symbol = String(it.symbol ?? it['symbol']) as SymbolPair;
      const pctStr = it.priceChangePercent ?? it['priceChangePercent'];
      if (typeof pctStr === 'string') {
        const pct = Number(pctStr);
        if (Number.isFinite(pct)) map[symbol] = pct;
      } else if (typeof pctStr === 'number' && Number.isFinite(pctStr)) {
        map[symbol] = pctStr as number;
      }
    }
    return map;
  } catch (e) {
    logger.warn({ err: e }, '24h ticker fetch error');
    return {};
  }
}
