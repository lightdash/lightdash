import { isSummable, MetricType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { GA4_REPORT_EXPLORE } from './explores';

describe('GA4 user and session counts', () => {
    it.each([
        'active_users',
        'total_users',
        'new_users',
        'sessions',
        'engaged_sessions',
    ])('%s is a distinct count nothing adds up', (name) => {
        const metric = GA4_REPORT_EXPLORE.metrics.find(
            (candidate) => candidate.name === name,
        );
        expect(metric).toMatchObject({
            type: MetricType.COUNT_DISTINCT,
            aggregation: { aggregation: 'non_additive' },
        });
        expect(isSummable({ ...metric, fieldType: 'metric' } as never)).toBe(
            false,
        );
    });
});
