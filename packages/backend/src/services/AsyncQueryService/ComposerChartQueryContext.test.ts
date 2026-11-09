import {
    ForbiddenError,
    metricQueryOfSemanticNode,
    MetricType,
    QuerySourceType,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    type Account,
    type ComposerSavedChartDAO,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { buildAccount } from '../ProjectService/ProjectService.mock';
import { ComposerChartQueryContext } from './ComposerChartQueryContext';

const account = buildAccount();
const otherAccount = {
    ...account,
    user: { ...account.user, id: 'someone-else', userUuid: 'someone-else' },
};
const projectUuid = 'project';

const ordersNode: SemanticLayerSourceQuery & { nodeId: string } = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
    additionalMetrics: [
        {
            name: 'amount_x2',
            table: 'orders',
            type: MetricType.SUM,
            sql: '${TABLE}.amount * 2',
        },
    ],
    limit: 500,
};
const paymentsNode: SemanticLayerSourceQuery & { nodeId: string } = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'payments',
    exploreName: 'payments',
    dimensions: ['payments_payment_method'],
    metrics: ['payments_total_revenue'],
    limit: 500,
};

const chart: Pick<ComposerSavedChartDAO, 'uuid' | 'projectUuid' | 'pipeline'> =
    {
        uuid: 'chart',
        projectUuid,
        pipeline: {
            schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
            nodes: [
                ordersNode,
                paymentsNode,
                {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId: 'joined',
                    sql: 'SELECT * FROM orders, payments',
                    references: ['orders', 'payments'],
                },
            ],
            terminalNodeId: 'joined',
        },
    };

describe('ComposerChartQueryContext', () => {
    const context = ComposerChartQueryContext.fromChart(
        account as Account,
        chart,
        null,
    );

    test('lets each semantic-layer node of the version run and names the node it is bound to as an input', () => {
        expect(
            context
                .forSemanticNode('orders')
                .assertMetricQuery(
                    account as Account,
                    projectUuid,
                    metricQueryOfSemanticNode(ordersNode),
                ),
        ).toEqual({ chartUuid: 'chart', nodeId: 'orders', role: 'input' });
        expect(
            context
                .forSemanticNode('payments')
                .assertMetricQuery(
                    account as Account,
                    projectUuid,
                    metricQueryOfSemanticNode(paymentsNode),
                ),
        ).toEqual({ chartUuid: 'chart', nodeId: 'payments', role: 'input' });
    });

    test('binds to a semantic node only: a duckdb or unknown node id is refused', () => {
        expect(() => context.forSemanticNode('joined')).toThrow(ForbiddenError);
        expect(() => context.forSemanticNode('elsewhere')).toThrow(
            ForbiddenError,
        );
    });

    test("a node's query run under another node's id is refused", () => {
        expect(() =>
            context
                .forSemanticNode('payments')
                .assertMetricQuery(
                    account as Account,
                    projectUuid,
                    metricQueryOfSemanticNode(ordersNode),
                ),
        ).toThrow(ForbiddenError);
    });

    test('two nodes with the same query each keep their own id and role', () => {
        const twin = { ...ordersNode, nodeId: 'orders_again' };
        const twins = ComposerChartQueryContext.fromChart(
            account as Account,
            {
                ...chart,
                pipeline: {
                    ...chart.pipeline,
                    nodes: [ordersNode, twin],
                    terminalNodeId: 'orders_again',
                },
            },
            null,
        );
        const query = metricQueryOfSemanticNode(ordersNode);
        expect(
            twins
                .forSemanticNode('orders')
                .assertMetricQuery(account as Account, projectUuid, query),
        ).toEqual({ chartUuid: 'chart', nodeId: 'orders', role: 'input' });
        expect(
            twins
                .forSemanticNode('orders_again')
                .assertMetricQuery(account as Account, projectUuid, query),
        ).toEqual({
            chartUuid: 'chart',
            nodeId: 'orders_again',
            role: 'terminal',
        });
    });

    test('names the terminal duckdb node of the version and refuses any other node id', () => {
        expect(context.nodeSource('joined')).toEqual({
            chartUuid: 'chart',
            nodeId: 'joined',
            role: 'terminal',
        });
        expect(() => context.nodeSource('elsewhere')).toThrow(ForbiddenError);
        expect(() => context.nodeSource(undefined)).toThrow(ForbiddenError);
    });

    test('a semantic terminal node is terminal, not an input', () => {
        const semanticTerminal = ComposerChartQueryContext.fromChart(
            account as Account,
            {
                ...chart,
                pipeline: {
                    ...chart.pipeline,
                    nodes: [ordersNode],
                    terminalNodeId: 'orders',
                },
            },
            null,
        );
        expect(
            semanticTerminal
                .forSemanticNode('orders')
                .assertMetricQuery(
                    account as Account,
                    projectUuid,
                    metricQueryOfSemanticNode(ordersNode),
                ),
        ).toEqual({ chartUuid: 'chart', nodeId: 'orders', role: 'terminal' });
    });

    test('the chart stage the run appends is named apart from the pipeline nodes', () => {
        const withStage = ComposerChartQueryContext.fromChart(
            account as Account,
            chart,
            'chart_stage',
        );
        expect(withStage.nodeSource('chart_stage')).toEqual({
            chartUuid: 'chart',
            nodeId: 'chart_stage',
            role: 'chartStage',
        });
        expect(withStage.nodeSource('joined')).toMatchObject({
            role: 'terminal',
        });
        expect(() => context.nodeSource('chart_stage')).toThrow(ForbiddenError);
    });

    test.each([
        [
            'an extra dimension',
            { ...ordersNode, dimensions: ['orders_status', 'orders_order_id'] },
        ],
        [
            'a changed custom SQL',
            {
                ...ordersNode,
                additionalMetrics: [
                    {
                        ...ordersNode.additionalMetrics![0],
                        sql: '${TABLE}.amount',
                    },
                ],
            },
        ],
        ['a different explore', { ...ordersNode, exploreName: 'customers' }],
        ['a dropped filter', { ...ordersNode, filters: { dimensions: {} } }],
    ])('refuses a query outside the version: %s', (_label, node) => {
        expect(() =>
            context
                .forSemanticNode('orders')
                .assertMetricQuery(
                    account as Account,
                    projectUuid,
                    metricQueryOfSemanticNode(node),
                ),
        ).toThrow(ForbiddenError);
    });

    test('refuses another account or project', () => {
        const query = metricQueryOfSemanticNode(ordersNode);
        const orders = context.forSemanticNode('orders');
        expect(() =>
            orders.assertMetricQuery(
                otherAccount as Account,
                projectUuid,
                query,
            ),
        ).toThrow(ForbiddenError);
        expect(() =>
            orders.assertMetricQuery(
                account as Account,
                'another-project',
                query,
            ),
        ).toThrow(ForbiddenError);
    });
});
