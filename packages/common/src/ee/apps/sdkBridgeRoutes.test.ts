import { describe, expect, it } from 'vitest';
import {
    extractAppSdkSpaceCharts,
    extractExploreBaseTable,
    isAllowedAppSdkRoute,
    isAppSdkComposerRoute,
    parseAppSdkComposerMetadata,
    parseAppSdkComposerRequest,
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

describe('composer routes', () => {
    const P = '/api/v2/projects/p-1';
    const CHART_QUERY_UUID = '3f1c2a7e-9b4d-4c1a-8e2f-0a1b2c3d4e5f';
    const orders = {
        sourceType: 'semanticLayer',
        nodeId: 'orders',
        title: 'Orders',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
    };
    const joined = {
        sourceType: 'duckdb',
        nodeId: 'joined',
        sql: 'SELECT * FROM o JOIN c USING (status)',
        references: { o: 'orders', c: CHART_QUERY_UUID },
    };

    it('allowlists submission and batch status, with a query string', () => {
        expect(isAllowedAppSdkRoute('POST', `${P}/query-sources/queries`)).toBe(
            true,
        );
        expect(
            isAllowedAppSdkRoute(
                'GET',
                `${P}/query-sources/queries/status?queryUuids=a,b`,
            ),
        ).toBe(true);
        expect(isAllowedAppSdkRoute('GET', `${P}/query-sources/queries`)).toBe(
            false,
        );
        expect(isAllowedAppSdkRoute('POST', `${P}/query-sources/schema`)).toBe(
            false,
        );
        expect(
            isAppSdkComposerRoute('post', `${P}/query-sources/queries`),
        ).toBe(true);
    });

    it('accepts semantic, duckdb and python nodes with map references', () => {
        const python = {
            sourceType: 'python',
            nodeId: 'scored',
            code: 'def run(inputs, params): return inputs["j"]',
            references: { j: 'joined' },
        };
        expect(
            parseAppSdkComposerRequest({
                queries: [orders, joined, python],
                parameters: { region: 'EU' },
            }),
        ).toEqual({
            ok: true,
            queries: [orders, joined, python],
            parameters: { region: 'EU' },
        });
    });

    it.each([
        ['a non-object body', null],
        ['an empty submission', { queries: [] }],
        [
            'too many nodes',
            {
                queries: Array.from({ length: 26 }, (_, i) => ({
                    ...orders,
                    nodeId: `n${i}`,
                })),
            },
        ],
        [
            'a sql node',
            {
                queries: [
                    { sourceType: 'sql', nodeId: 'raw', sql: 'select 1' },
                ],
            },
        ],
        [
            'an external node',
            {
                queries: [
                    {
                        sourceType: 'external',
                        nodeId: 'x',
                        sql: '',
                        tables: [],
                    },
                ],
            },
        ],
        ['a missing nodeId', { queries: [{ ...orders, nodeId: undefined }] }],
        ['an invalid nodeId', { queries: [{ ...orders, nodeId: '1-bad' }] }],
        ['duplicate nodeIds', { queries: [orders, orders] }],
        [
            'array-form references',
            { queries: [orders, { ...joined, references: ['orders'] }] },
        ],
        [
            'a reference to an unknown node',
            { queries: [orders, { ...joined, references: { o: 'missing' } }] },
        ],
        ['a non-string title', { queries: [{ ...orders, title: 7 }] }],
        ['non-object parameters', { queries: [orders], parameters: 'x' }],
    ])('rejects %s', (_, body) => {
        expect(parseAppSdkComposerRequest(body).ok).toBe(false);
    });

    it('parses composer metadata and drops malformed saved-chart nodes', () => {
        expect(
            parseAppSdkComposerMetadata({
                kind: 'composer',
                queryId: 'revenue',
                label: 'Revenue',
                description: null,
                terminalNodeId: 'joined',
                savedChartNodes: [
                    {
                        nodeId: 'c',
                        chartUuid: 'chart-1',
                        queryUuid: CHART_QUERY_UUID,
                        title: 'Chart',
                        description: null,
                    },
                    { nodeId: 'broken' },
                ],
            }),
        ).toEqual({
            kind: 'composer',
            queryId: 'revenue',
            label: 'Revenue',
            description: null,
            terminalNodeId: 'joined',
            savedChartNodes: [
                {
                    nodeId: 'c',
                    chartUuid: 'chart-1',
                    queryUuid: CHART_QUERY_UUID,
                    title: 'Chart',
                    description: null,
                },
            ],
        });
        expect(parseAppSdkComposerMetadata({ label: 'x' })).toBe(null);
    });
});
