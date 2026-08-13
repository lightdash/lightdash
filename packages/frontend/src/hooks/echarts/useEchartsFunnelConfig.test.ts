import { describe, expect, test } from 'vitest';
import { FUNNEL_SERIES_DEFAULTS } from './useEchartsFunnelConfig';

describe('FUNNEL_SERIES_DEFAULTS', () => {
    test('should keep the step order the query returned', () => {
        // ECharts defaults a funnel series to `sort: 'descending'`, which
        // re-orders the steps by value. A funnel's step order is meaningful
        // and independent of size, so the order has to be preserved.
        expect(FUNNEL_SERIES_DEFAULTS.sort).toEqual('none');
    });

    test('should be a funnel series with a gap between steps', () => {
        expect(FUNNEL_SERIES_DEFAULTS).toEqual({
            type: 'funnel',
            gap: 3,
            sort: 'none',
        });
    });
});
