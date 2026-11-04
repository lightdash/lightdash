import { describe, expect, it } from 'vitest';
import {
    extractAppSdkSpaceCharts,
    extractExploreBaseTable,
    isAllowedAppSdkRoute,
    parseAppSdkExploreBaseTableRequest,
    parseAppSdkSpaceChartsRequest,
    resolveAppSdkSpaceUuid,
} from './sdkBridgeRoutes';
import {
    APP_SDK_EXPLORE_BASE_TABLE_PATH,
    APP_SDK_SPACE_CHARTS_PATH,
} from './types';

describe('explore base-table virtual route', () => {
    it('is not on the forwarding allowlist', () => {
        expect(
            isAllowedAppSdkRoute('POST', APP_SDK_EXPLORE_BASE_TABLE_PATH),
        ).toBe(false);
    });

    it('parses only a non-empty explore name', () => {
        expect(
            parseAppSdkExploreBaseTableRequest({ exploreName: 'orders' }),
        ).toEqual({ exploreName: 'orders' });
        expect(parseAppSdkExploreBaseTableRequest({ exploreName: '' })).toBe(
            null,
        );
        expect(parseAppSdkExploreBaseTableRequest({ exploreName: 1 })).toBe(
            null,
        );
        expect(parseAppSdkExploreBaseTableRequest(null)).toBe(null);
        expect(parseAppSdkExploreBaseTableRequest('orders')).toBe(null);
    });

    it('extracts the base table from an explore response body', () => {
        expect(
            extractExploreBaseTable({
                status: 'ok',
                results: { name: 'custom', baseTable: 'orders' },
            }),
        ).toBe('orders');
        expect(extractExploreBaseTable({ results: { baseTable: '' } })).toBe(
            null,
        );
        expect(extractExploreBaseTable({ results: null })).toBe(null);
        expect(extractExploreBaseTable(null)).toBe(null);
    });
});

describe('space-charts virtual route', () => {
    it('is not on the forwarding allowlist', () => {
        expect(isAllowedAppSdkRoute('POST', APP_SDK_SPACE_CHARTS_PATH)).toBe(
            false,
        );
    });

    it('parses only a non-empty space reference, trimmed', () => {
        expect(parseAppSdkSpaceChartsRequest({ space: 'sales' })).toEqual({
            space: 'sales',
        });
        expect(parseAppSdkSpaceChartsRequest({ space: '  sales ' })).toEqual({
            space: 'sales',
        });
        expect(parseAppSdkSpaceChartsRequest({ space: '  ' })).toBe(null);
        expect(parseAppSdkSpaceChartsRequest({ space: 7 })).toBe(null);
        expect(parseAppSdkSpaceChartsRequest(null)).toBe(null);
        expect(parseAppSdkSpaceChartsRequest('sales')).toBe(null);
    });

    it('resolves a space reference by uuid or slug against the list body', () => {
        const listBody = {
            status: 'ok',
            results: [
                { uuid: 'uuid-1', slug: 'sales' },
                { uuid: 'uuid-2', slug: 'marketing' },
            ],
        };
        expect(resolveAppSdkSpaceUuid(listBody, 'marketing')).toBe('uuid-2');
        expect(resolveAppSdkSpaceUuid(listBody, 'uuid-1')).toBe('uuid-1');
        expect(resolveAppSdkSpaceUuid(listBody, 'missing')).toBe(null);
        expect(resolveAppSdkSpaceUuid({ results: 'nope' }, 'sales')).toBe(null);
        expect(resolveAppSdkSpaceUuid(null, 'sales')).toBe(null);
    });

    it('trims a space body to identity and chart summaries only', () => {
        const spaceBody = {
            status: 'ok',
            results: {
                uuid: 'uuid-1',
                name: 'Sales',
                slug: 'sales',
                access: [{ userUuid: 'secret' }],
                groupsAccess: [{ groupUuid: 'secret' }],
                dashboards: [{ uuid: 'dash' }],
                queries: [
                    {
                        uuid: 'chart-1',
                        name: 'Revenue',
                        description: 'Monthly revenue',
                        chartKind: 'line',
                        slug: 'revenue',
                        updatedAt: '2026-10-29T00:00:00.000Z',
                        updatedByUser: { userUuid: 'secret' },
                        views: 42,
                    },
                    { uuid: 'chart-2', name: 'Orders' },
                    { name: 'malformed, no uuid' },
                ],
            },
        };
        expect(extractAppSdkSpaceCharts(spaceBody)).toEqual({
            space: { uuid: 'uuid-1', name: 'Sales', slug: 'sales' },
            charts: [
                {
                    uuid: 'chart-1',
                    name: 'Revenue',
                    description: 'Monthly revenue',
                    chartKind: 'line',
                    slug: 'revenue',
                    updatedAt: '2026-10-29T00:00:00.000Z',
                },
                {
                    uuid: 'chart-2',
                    name: 'Orders',
                    description: null,
                    chartKind: null,
                    slug: null,
                    updatedAt: null,
                },
            ],
        });
        expect(extractAppSdkSpaceCharts({ results: { uuid: 'u' } })).toBe(null);
        expect(extractAppSdkSpaceCharts(null)).toBe(null);
    });
});
