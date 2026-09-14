import {
    ChartType,
    ContentAsCodeType,
    type ChartAsCode,
} from '@lightdash/common';
import { buildContentAsCodeSnapshot } from './contentAsCodeSnapshot';

const chartAsCode = (overrides: Partial<ChartAsCode> = {}): ChartAsCode =>
    ({
        name: 'Monthly revenue',
        description: 'Revenue by month',
        tableName: 'orders',
        updatedAt: new Date('2026-08-24T10:00:00Z'),
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_order_month'],
            metrics: ['orders_total_revenue'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.CARTESIAN, config: {} },
        slug: 'monthly-revenue',
        tableConfig: { columnOrder: [] },
        spaceSlug: 'finance',
        version: 1,
        contentType: ContentAsCodeType.CHART,
        downloadedAt: new Date('2026-08-24T11:00:00Z'),
        ...overrides,
    }) as ChartAsCode;

describe('buildContentAsCodeSnapshot', () => {
    it('strips timestamps and verification runtime state', () => {
        const { snapshot } = buildContentAsCodeSnapshot(
            chartAsCode({
                verified: true,
                verification: {
                    verifiedAt: new Date('2026-08-01T00:00:00Z'),
                    verifiedBy: {
                        userUuid: 'user-1',
                        firstName: 'Ada',
                        lastName: 'Lovelace',
                    },
                },
            }),
        );

        expect(snapshot).not.toHaveProperty('updatedAt');
        expect(snapshot).not.toHaveProperty('downloadedAt');
        expect(snapshot).not.toHaveProperty('verification');
        expect(snapshot).toHaveProperty('verified', true);
    });

    it('hashes identically regardless of key order and undefined values', () => {
        const base = chartAsCode();
        const reordered = Object.fromEntries(
            Object.entries(base).reverse(),
        ) as unknown as ChartAsCode;
        const withUndefined = chartAsCode({
            pivotConfig: undefined,
            dashboardSlug: undefined,
        });

        const baseResult = buildContentAsCodeSnapshot(base);
        expect(buildContentAsCodeSnapshot(reordered).snapshotHash).toEqual(
            baseResult.snapshotHash,
        );
        expect(buildContentAsCodeSnapshot(withUndefined).snapshotHash).toEqual(
            baseResult.snapshotHash,
        );
    });

    it('hashes identically for different timestamps', () => {
        const first = buildContentAsCodeSnapshot(
            chartAsCode({ updatedAt: new Date('2026-01-01T00:00:00Z') }),
        );
        const second = buildContentAsCodeSnapshot(
            chartAsCode({ updatedAt: new Date('2026-06-01T00:00:00Z') }),
        );
        expect(first.snapshotHash).toEqual(second.snapshotHash);
    });

    it('changes the hash when declarative content changes', () => {
        const base = buildContentAsCodeSnapshot(chartAsCode());
        const renamed = buildContentAsCodeSnapshot(
            chartAsCode({ name: 'Monthly revenue (net)' }),
        );
        expect(renamed.snapshotHash).not.toEqual(base.snapshotHash);
    });

    it('serialises nested dates and preserves array order', () => {
        const withSorts = chartAsCode({
            metricQuery: {
                ...chartAsCode().metricQuery,
                sorts: [
                    { fieldId: 'orders_order_month', descending: false },
                    { fieldId: 'orders_total_revenue', descending: true },
                ],
            },
        });
        const reversedSorts = chartAsCode({
            metricQuery: {
                ...chartAsCode().metricQuery,
                sorts: [
                    { fieldId: 'orders_total_revenue', descending: true },
                    { fieldId: 'orders_order_month', descending: false },
                ],
            },
        });

        expect(buildContentAsCodeSnapshot(withSorts).snapshotHash).not.toEqual(
            buildContentAsCodeSnapshot(reversedSorts).snapshotHash,
        );
    });
});
