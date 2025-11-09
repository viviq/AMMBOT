import TelegramBot from 'node-telegram-bot-api';
import { cmcSlugCache } from '../cmcSlugCache.js';
/**
 * 构造告警消息文本
 */
function formatUsdShort(v) {
    const abs = Math.abs(v);
    if (abs >= 1e9)
        return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6)
        return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3)
        return `${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(0);
}
function signPct(x) {
    const s = x >= 0 ? '+' : '';
    return `${s}${x.toFixed(1)}%`;
}
function tokenFromSymbol(symbol) {
    const bases = ['USDT', 'BUSD', 'USD', 'USDC'];
    for (const b of bases) {
        if (symbol.endsWith(b))
            return symbol.slice(0, -b.length);
    }
    return symbol;
}
/**
 * 生成币安期货交易页面 URL
 */
function getBinanceUrl(symbol) {
    return `https://www.binance.com/en/futures/${symbol}`;
}
export function formatMessage(d) {
    const f = d.features;
    const secs = f.windowSeconds ?? 600;
    const token = tokenFromSymbol(d.symbol);
    const oiUsd = (f.latestOpenInterest && f.latestMarkPrice) ? f.latestOpenInterest * f.latestMarkPrice : undefined;
    const frPct = f.fundingRate !== undefined ? `${(f.fundingRate * 100).toFixed(Math.abs(f.fundingRate) < 0.01 ? 4 : 2)}%` : 'N/A';
    const enParts = [];
    const cnParts = [];
    const enLine = [
        `🇺🇸 ${d.symbol} Binance openinterest ${f.oiChangePct10m !== undefined ? signPct(f.oiChangePct10m) : 'N/A'},`,
        `Price ${f.priceChangePct10m !== undefined ? signPct(f.priceChangePct10m) : 'N/A'} in the past ${secs} seconds,`,
        `OI: ${oiUsd !== undefined ? `$${formatUsdShort(oiUsd)}` : 'N/A'},`,
        `Funding Rate: ${frPct},`,
        `OI/Marketcap ratio: ${f.marketCapUSD && oiUsd ? signPct(oiUsd / f.marketCapUSD * 100) : 'N/A'},`,
        `24H Price Change: ${f.priceChange24hPct !== undefined ? signPct(f.priceChange24hPct) : 'N/A'}`,
    ].join(' ');
    const cnLine = [
        `🇨🇳 ${d.symbol}币安未平仓合约${f.oiChangePct10m !== undefined ? `增长${signPct(f.oiChangePct10m)}` : '数据暂缺'},`,
        `过去${secs}秒价格${f.priceChangePct10m !== undefined ? `${f.priceChangePct10m >= 0 ? '上涨' : '下跌'}${signPct(f.priceChangePct10m)}` : '数据暂缺'},`,
        `未平仓合约：${oiUsd !== undefined ? `$${formatUsdShort(oiUsd)}` : 'N/A'}，`,
        `资金费率：${frPct}，`,
        `未平仓合约/市值比率：${f.marketCapUSD && oiUsd ? signPct(oiUsd / f.marketCapUSD * 100) : 'N/A'}，`,
        `24小时价格变化：${f.priceChange24hPct !== undefined ? signPct(f.priceChange24hPct) : 'N/A'}`,
    ].join(' ');
    enParts.push(enLine);
    cnParts.push(cnLine);
    const lines = [enLine, cnLine, '', '💰 市值'];
    if (f.marketCapUSD) {
        lines.push(`$${token}  MarketCap: $${formatUsdShort(f.marketCapUSD)}`);
    }
    return lines.join('\n');
}
/**
 * 发送Telegram通知（带有 CMC 和 Binance 按钮）
 */
export async function sendTelegram(cfg, d) {
    const bot = new TelegramBot(cfg.telegram.botToken);
    const text = formatMessage(d);
    const token = tokenFromSymbol(d.symbol);
    // 创建内联键盘按钮
    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: 'CMC', url: cmcSlugCache.getCmcUrl(token) },
                { text: 'BINANCE', url: getBinanceUrl(d.symbol) }
            ]
        ]
    };
    await Promise.all(cfg.telegram.chatIds.map(async (chatId) => bot.sendMessage(chatId, text, { reply_markup: inlineKeyboard })));
}
