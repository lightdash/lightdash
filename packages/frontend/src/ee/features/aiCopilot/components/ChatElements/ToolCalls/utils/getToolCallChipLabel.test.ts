import { describe, expect, it } from 'vitest';
import { getToolCallChipLabel } from './getToolCallChipLabel';

describe('getToolCallChipLabel', () => {
    it('returns null for runSql args without crashing', () => {
        // Regression: runSql used to fall through into the runContentQuery
        // handler and read `args.source.type` off undefined
        expect(
            getToolCallChipLabel('runSql', { sql: 'select 1', limit: 500 }),
        ).toBeNull();
    });

    it('returns null for runSavedChart args', () => {
        expect(
            getToolCallChipLabel('runSavedChart', { chartSlug: 'my-chart' }),
        ).toBeNull();
    });

    it('returns the table name for runContentQuery metricQuery sources', () => {
        expect(
            getToolCallChipLabel('runContentQuery', {
                source: { type: 'metricQuery', tableName: 'orders' },
            }),
        ).toBe('orders');
    });

    it('returns dashboard and chart slugs for runContentQuery dashboardChart sources', () => {
        expect(
            getToolCallChipLabel('runContentQuery', {
                source: {
                    type: 'dashboardChart',
                    dashboardSlug: 'sales',
                    chartSlug: 'revenue',
                },
            }),
        ).toBe('sales: revenue');
    });

    it('returns null for runContentQuery args without a source', () => {
        expect(getToolCallChipLabel('runContentQuery', {})).toBeNull();
    });

    it('returns null when toolArgs is undefined', () => {
        expect(getToolCallChipLabel('runSql', undefined)).toBeNull();
    });
});
