import { evaluateRules } from '../src/rules';
import { AppConfig } from '../src/types';

const cfg: AppConfig = {
  thresholds: { priceChangePct10m: 0.05, oiChangePct10m: 0.05, fundingRateLt: -0.01 },
  symbols: { blacklist: [] },
  sampling: { wsIntervalSec: 1, oiPollIntervalSec: 60, restBatchSize: 50 },
  rateLimit: { perSymbolWindowSec: 600, globalWindowSec: 60 },
  telegram: { botToken: 'x', chatIds: ['1'] },
};

describe('evaluateRules', () => {
  test('triggers when price and oi are outside ±5%', () => {
    const f = {
      symbol: 'BTCUSDT',
      ts: Date.now(),
      priceChangePct10m: -5.6,
      oiChangePct10m: 6.2,
      fundingRate: -0.02, // funding not considered for triggers
    };
    const d = evaluateRules(cfg, f);
    expect(d.triggers).toEqual(['PRICE', 'OI']);
  });
});
