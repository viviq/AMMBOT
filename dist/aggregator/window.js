/**
 * 简单的时间窗口序列，保持10分钟内样本
 */
class TimeWindow {
    items = [];
    maxAgeMs;
    constructor(maxAgeMs) {
        this.maxAgeMs = maxAgeMs;
    }
    push(v) {
        this.items.push(v);
        this.compact();
    }
    compact(now = Date.now()) {
        const cutoff = now - this.maxAgeMs;
        while (this.items.length && this.items[0].ts < cutoff)
            this.items.shift();
    }
}
/**
 * 每个symbol维护价格与OI的10分钟窗口并计算特征
 */
export class FeatureAggregator {
    priceSeries = new Map();
    oiSeries = new Map();
    windowMs;
    constructor(windowMinutes = 10) {
        this.windowMs = windowMinutes * 60 * 1000;
    }
    /** 记录价格tick */
    onPriceTick(t) {
        const s = this.priceSeries.get(t.symbol) || new TimeWindow(this.windowMs);
        s.push(t);
        this.priceSeries.set(t.symbol, s);
    }
    /** 记录OI快照 */
    onOpenInterest(o) {
        const s = this.oiSeries.get(o.symbol) || new TimeWindow(this.windowMs);
        s.push(o);
        this.oiSeries.set(o.symbol, s);
    }
    /** 计算当前窗口特征 */
    features(symbol) {
        const p = this.priceSeries.get(symbol);
        const o = this.oiSeries.get(symbol);
        if (!p && !o)
            return undefined;
        const ts = Date.now();
        const f = { symbol, ts, windowSeconds: Math.round(this.windowMs / 1000) };
        if (p && p.items.length >= 1) {
            const lastP = p.items[p.items.length - 1];
            f.latestMarkPrice = lastP.markPrice;
            if (lastP.fundingRate !== undefined)
                f.fundingRate = lastP.fundingRate;
            if (p.items.length >= 2) {
                const first = p.items[0].markPrice;
                const last = lastP.markPrice;
                if (first > 0)
                    f.priceChangePct10m = (last - first) / first * 100;
            }
        }
        if (o && o.items.length >= 1) {
            const lastO = o.items[o.items.length - 1];
            f.latestOpenInterest = lastO.openInterest;
            if (o.items.length >= 2) {
                const first = o.items[0].openInterest;
                const last = lastO.openInterest;
                if (first > 0)
                    f.oiChangePct10m = (last - first) / first * 100;
            }
        }
        return f;
    }
}
