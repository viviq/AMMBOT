/**
 * 基于配置阈值的规则触发（作为候选集筛选）
 */
export function evaluateRules(cfg, f) {
    const triggers = [];
    // 价格异常：绝对值超出阈值（例如 -5% 到 5% 之外）
    if (f.priceChangePct10m !== undefined &&
        Math.abs(f.priceChangePct10m) > cfg.thresholds.priceChangePct10m * 100) {
        triggers.push('PRICE');
    }
    // OI异常：绝对值超出阈值（例如 -5% 到 5% 之外）
    if (f.oiChangePct10m !== undefined &&
        Math.abs(f.oiChangePct10m) > cfg.thresholds.oiChangePct10m * 100) {
        triggers.push('OI');
    }
    // 资金费率异常暂不限制（不作为触发条件）
    const suppressed = false; // 频率控制在决策服务中处理
    return { symbol: f.symbol, ts: f.ts, triggers, features: f, suppressed };
}
