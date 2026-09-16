import {
    ChartType,
    ConflictError,
    ForbiddenError,
    MergeJoinType,
    NotFoundError,
    type Document,
    type MetricQuery,
    type RegisteredAccount,
} from '@lightdash/common';
import { buildAccount } from '../ProjectService/ProjectService.mock';
import { DocumentQueryContext } from './DocumentQueryContext';
import type { DocumentService } from './DocumentService';

const account = buildAccount() as RegisteredAccount;
const projectUuid = 'project';
const reference = {
    documentUuid: 'document',
    versionUuid: 'version',
    cellId: 'chart',
};
const query: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
};
const chart = {
    name: 'Orders',
    tableName: 'orders',
    metricQuery: query,
    chartConfig: { type: ChartType.TABLE } as const,
};
const document = {
    documentUuid: reference.documentUuid,
    projectUuid,
    version: {
        versionUuid: reference.versionUuid,
        content: {
            cells: [
                {
                    id: reference.cellId,
                    type: 'chart',
                    content: {
                        source: 'semantic',
                        chart,
                    },
                },
            ],
        },
    },
} as Document;

const setup = (savedDocument = document) => {
    const get = vi.fn().mockResolvedValue(savedDocument);
    const authorize = () =>
        DocumentQueryContext.authorize({
            documentService: { get } as unknown as DocumentService,
            account,
            projectUuid,
            reference,
            sourceRowCap: 1000,
        });
    return { get, authorize };
};

describe('DocumentQueryContext', () => {
    test('loads the persisted cell through Document authorization and binds query identity', async () => {
        const { get, authorize } = setup();
        const context = await authorize();
        expect(get).toHaveBeenCalledWith(
            account,
            projectUuid,
            reference.documentUuid,
        );
        expect(context.reference).toEqual(reference);
        expect(() =>
            context.assertMetricQuery(
                account,
                projectUuid,
                context.metricQuery,
            ),
        ).not.toThrow();
        expect(() =>
            context.assertMetricQuery(
                account,
                'another-project',
                context.metricQuery,
            ),
        ).toThrow(ForbiddenError);
        expect(() =>
            context.assertMetricQuery(
                { ...account, user: { ...account.user, id: 'another-user' } },
                projectUuid,
                context.metricQuery,
            ),
        ).toThrow(ForbiddenError);
    });

    test.each([
        { metrics: ['orders_secret'] },
        { filters: { dimensions: { id: 'injected', and: [] } } },
        { limit: 200 },
        { exploreName: 'private_orders' },
        { tableCalculations: [{ name: 'sql', displayName: 'SQL', sql: '1' }] },
    ])('refuses an altered saved query: %j', async (change) => {
        const context = await setup().authorize();
        expect(() =>
            context.assertMetricQuery(account, projectUuid, {
                ...context.metricQuery,
                ...change,
            }),
        ).toThrow(ForbiddenError);
    });

    test('does not allow caller parameter overrides', async () => {
        const context = await setup().authorize();
        expect(() =>
            context.assertMetricQuery(
                account,
                projectUuid,
                context.metricQuery,
                { region: 'other' },
            ),
        ).toThrow(ForbiddenError);
    });

    test('requires the current version and a chart cell', async () => {
        await expect(
            setup({
                ...document,
                version: { ...document.version, versionUuid: 'newer' },
            }).authorize(),
        ).rejects.toThrow(ConflictError);
        await expect(
            setup({
                ...document,
                version: { ...document.version, content: { cells: [] } },
            }).authorize(),
        ).rejects.toThrow(NotFoundError);
        await expect(
            setup({
                ...document,
                version: {
                    ...document.version,
                    content: {
                        cells: [
                            {
                                id: 'chart',
                                type: 'markdown',
                                content: { markdown: 'text' },
                            },
                        ],
                    },
                },
            }).authorize(),
        ).rejects.toThrow(NotFoundError);
    });

    test.each([
        new NotFoundError('Deleted or foreign Document'),
        new ForbiddenError('Disabled or revoked'),
    ])('propagates Document authorization failure', async (error) => {
        const { get, authorize } = setup();
        get.mockRejectedValue(error);
        await expect(authorize()).rejects.toBe(error);
    });

    test('binds the complete merge and permits only unsorted row-capped persisted legs', async () => {
        const sourceQuery = {
            ...query,
            exploreName: 'payments',
            metrics: ['payments_count'],
        };
        const saved: Document = {
            ...document,
            version: {
                ...document.version,
                content: {
                    cells: [
                        {
                            id: 'chart',
                            type: 'chart',
                            content: {
                                source: 'merge',
                                chart: {
                                    ...chart,
                                    merge: {
                                        primarySourceId: 'a',
                                        sources: [
                                            { id: 'a', kind: 'chart' },
                                            {
                                                id: 'b',
                                                kind: 'query',
                                                metricQuery: sourceQuery,
                                            },
                                        ],
                                        joinKey: [
                                            {
                                                name: 'status',
                                                fieldIdBySourceId: {
                                                    a: 'orders_status',
                                                    b: 'orders_status',
                                                },
                                            },
                                        ],
                                        joinType: MergeJoinType.FULL,
                                        tableCalculations: [],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        };
        const context = await setup(saved).authorize();
        const { mergeQuery } = context;
        if (!mergeQuery) {
            throw new Error('Expected a merge');
        }
        expect(() =>
            context.assertMergeQuery(account, projectUuid, mergeQuery),
        ).not.toThrow();
        expect(() =>
            context.assertMergeQuery(account, projectUuid, {
                ...mergeQuery,
                joinType: MergeJoinType.INNER,
            }),
        ).toThrow(ForbiddenError);
        for (const source of mergeQuery.sources) {
            if (!('metricQuery' in source)) {
                throw new Error('Expected a persisted metric source');
            }
            const leg = { ...source.metricQuery, sorts: [], limit: 1000 };
            expect(() =>
                context.assertMetricQuery(account, projectUuid, leg),
            ).not.toThrow();
            expect(() =>
                context.assertMetricQuery(account, projectUuid, {
                    ...leg,
                    limit: 1001,
                }),
            ).toThrow(ForbiddenError);
            expect(() =>
                context.assertMetricQuery(account, projectUuid, {
                    ...leg,
                    dimensions: [],
                }),
            ).toThrow(ForbiddenError);
        }
    });
});
