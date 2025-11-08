import { FeatureAggregator } from '../src/aggregator/window';

describe('FeatureAggregator', () => {
  test('computes price and oi change in 10m window', () => {
    const agg = new FeatureAggregator(10);
    const now = Date.now();
    agg.onPriceTick({ symbol: 'BTCUSDT', ts: now - 9 * 60 * 1000, markPrice: 100, fundingRate: 0.001 });
    agg.onPriceTick({ symbol: 'BTCUSDT', ts: now, markPrice: 105, fundingRate: 0.001 });
    agg.onOpenInterest({ symbol: 'BTCUSDT', ts: now - 9 * 60 * 1000, openInterest: 1000 });
    agg.onOpenInterest({ symbol: 'BTCUSDT', ts: now, openInterest: 1045 });
    const f = agg.features('BTCUSDT');
    expect(f?.priceChangePct10m).toBeCloseTo(5);
    expect(f?.oiChangePct10m).toBeCloseTo(4.5);
    expect(f?.fundingRate).toBeCloseTo(0.001);
  });
});
