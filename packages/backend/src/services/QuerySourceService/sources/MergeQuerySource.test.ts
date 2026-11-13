import {
    MergeJoinType,
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type MergeSourceQuery,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import type { RunnableCompiledMergeQuery } from '../../AsyncQueryService/AsyncQueryService';
import type { SubmitSourceQueryArgs, SubmittedSourceQueries } from '../types';
import { MergeQuerySource } from './MergeQuerySource';

const account = buildAccount();
const projectUuid = '11111111-1111-4111-8111-111111111111';

const orders: SemanticLayerSourceQuery & { nodeId: string } = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders_by_month',
    title: 'Orders by month',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    parameters: { 'orders.region': 'EU' },
    limit: 500,
};
const payments: SemanticLayerSourceQuery & { nodeId: string } = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'payments_by_month',
    exploreName: 'payments',
    dimensions: ['payments_payment_date_month'],
    metrics: ['payments_total_revenue'],
    limit: 1000,
};
const merge: MergeSourceQuery & { nodeId: string } = {
    sourceType: QuerySourceType.MERGE,
    nodeId: 'revenue_vs_orders',
    sources: [{ nodeId: orders.nodeId }, { nodeId: payments.nodeId }],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: {
                [orders.nodeId]: 'orders_order_date_month',
                [payments.nodeId]: 'payments_payment_date_month',
            },
        },
    ],
    joinType: MergeJoinType.FULL,
    limit: 200,
};

const compiled = { coreSql: 'select 1' } as RunnableCompiledMergeQuery;

const createSource = () => {
    const compileComposerMerge = vi.fn().mockResolvedValue(compiled);
    const submitComposerMergeJoin = vi
        .fn()
        .mockResolvedValue({ queryUuid: 'merge-query-uuid' });
    return {
        source: new MergeQuerySource({
            asyncQueryService: {
                compileComposerMerge,
                submitComposerMergeJoin,
            },
        }),
        compileComposerMerge,
        submitComposerMergeJoin,
    };
};

const args = (
    query: MergeSourceQuery,
    submission: SubmittedSourceQueries,
): SubmitSourceQueryArgs => ({
    account,
    projectUuid,
    context: QueryExecutionContext.AI,
    query,
    submission,
    resolvedReferences: {
        [orders.nodeId]: 'orders-query-uuid',
        [payments.nodeId]: 'payments-query-uuid',
    },
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
    pivotConfiguration: null,
    plan: null,
    binding: null,
});

describe('MergeQuerySource', () => {
    it('reads its source nodes', () => {
        expect(createSource().source.getQueryReferences(merge)).toEqual([
            orders.nodeId,
            payments.nodeId,
        ]);
    });

    it('compiles the merge of the source nodes under their node ids, once', async () => {
        const { source, compileComposerMerge, submitComposerMergeJoin } =
            createSource();
        const submitArgs = args(merge, [orders, payments, merge]);

        await source.validateQuery(submitArgs);
        await expect(source.submitQuery(submitArgs)).resolves.toEqual({
            queryUuid: 'merge-query-uuid',
            cacheHit: false,
        });

        expect(compileComposerMerge).toHaveBeenCalledTimes(1);
        const [{ mergeQuery, parameters, sourceTitleById }] =
            compileComposerMerge.mock.calls[0];
        // A source of a shared explore is told apart by its node title, else its id
        expect(sourceTitleById).toEqual({
            [orders.nodeId]: 'Orders by month',
            [payments.nodeId]: payments.nodeId,
        });
        expect(mergeQuery.sources.map(({ id }: { id: string }) => id)).toEqual([
            orders.nodeId,
            payments.nodeId,
        ]);
        expect(mergeQuery.sources[0].metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_order_date_month'],
            limit: 500,
        });
        expect(mergeQuery.limit).toBe(200);
        expect(parameters).toEqual({ 'orders.region': 'EU' });
        expect(submitComposerMergeJoin).toHaveBeenCalledWith(
            expect.objectContaining({
                compiledMerge: compiled,
                legQueryUuidBySourceId: {
                    [orders.nodeId]: 'orders-query-uuid',
                    [payments.nodeId]: 'payments-query-uuid',
                },
                labelBySourceId: {
                    [orders.nodeId]: '"Orders by month"',
                    [payments.nodeId]: 'Query "payments_by_month"',
                },
            }),
        );
    });

    it('refuses a source that is not a semanticLayer node, naming the fix', async () => {
        const { source, compileComposerMerge } = createSource();
        const duckdb = {
            sourceType: QuerySourceType.DUCKDB as const,
            nodeId: payments.nodeId,
            sql: 'select 1',
            references: [orders.nodeId],
        };
        await expect(
            source.validateQuery(args(merge, [orders, duckdb, merge])),
        ).rejects.toThrow(
            new ParameterError(
                'Merge node "revenue_vs_orders" reads "payments_by_month", which is not a semanticLayer node of this pipeline. A merge joins semanticLayer nodes; join other results with a duckdb node.',
            ),
        );
        expect(compileComposerMerge).not.toHaveBeenCalled();
    });

    it('refuses a join key its source node does not select', async () => {
        const { source } = createSource();
        await expect(
            source.validateQuery(
                args(merge, [
                    orders,
                    { ...payments, dimensions: ['payments_payment_method'] },
                    merge,
                ]),
            ),
        ).rejects.toThrow(
            'Join key "month" names "payments_payment_date_month" on node "payments_by_month", which that node does not select. Add "payments_payment_date_month" to the dimensions of node "payments_by_month".',
        );
    });

    it('refuses sources that set one parameter differently', async () => {
        const { source, compileComposerMerge } = createSource();
        await expect(
            source.validateQuery(
                args(merge, [
                    orders,
                    { ...payments, parameters: { 'orders.region': 'US' } },
                    merge,
                ]),
            ),
        ).rejects.toThrow(
            'Merge node "revenue_vs_orders" reads nodes that set parameter "orders.region" differently.',
        );
        expect(compileComposerMerge).not.toHaveBeenCalled();
    });

    it('refuses a pivoted source node', async () => {
        const { source } = createSource();
        await expect(
            source.validateQuery(
                args(merge, [
                    orders,
                    {
                        ...payments,
                        pivotConfiguration: {
                            indexColumn: undefined,
                            valuesColumns: [],
                            groupByColumns: undefined,
                            sortBy: undefined,
                        },
                    },
                    merge,
                ]),
            ),
        ).rejects.toThrow('which is pivoted');
    });

    it('refuses a pivot', async () => {
        const { source } = createSource();
        await expect(
            source.validateQuery(
                args(
                    {
                        ...merge,
                        pivotConfiguration: {
                            indexColumn: undefined,
                            valuesColumns: [],
                            groupByColumns: undefined,
                            sortBy: undefined,
                        },
                    },
                    [orders, payments, merge],
                ),
            ),
        ).rejects.toThrow(ParameterError);
    });
});
