import { describe, expect, it } from 'vitest';
import {
    formatPreAggregateFallbackReason,
    formatPreAggregateFallbackTooltip,
} from './PreAggregateAuditIndicator.utils';

describe('formatPreAggregateFallbackReason', () => {
    it.each([
        ['duckdb_execution_error', 'DuckDB read failed'],
        ['external_execution_error', 'external pre-aggregate failed'],
        ['materialization_near_expiry', 'pre-aggregate expired, refresh it'],
    ] as const)('labels %s', (reason, label) => {
        expect(formatPreAggregateFallbackReason(reason)).toBe(label);
    });
});

describe('formatPreAggregateFallbackTooltip', () => {
    it('names the pre-aggregate and the reason', () => {
        expect(
            formatPreAggregateFallbackTooltip(
                'orders_daily',
                'materialization_near_expiry',
            ),
        ).toBe(
            'Pre-aggregate matched (orders_daily). Served from warehouse: pre-aggregate expired, refresh it',
        );
    });
});
