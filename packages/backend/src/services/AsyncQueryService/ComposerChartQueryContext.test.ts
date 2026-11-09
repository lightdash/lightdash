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
    );

    test('lets each semantic-layer node of the version run', () => {
        expect(() =>
            context.assertMetricQuery(
                account as Account,
                projectUuid,
                metricQueryOfSemanticNode(ordersNode),
            ),
        ).not.toThrow();
        expect(() =>
            context.assertMetricQuery(
                account as Account,
                projectUuid,
                metricQueryOfSemanticNode(paymentsNode),
            ),
        ).not.toThrow();
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
            context.assertMetricQuery(
                account as Account,
                projectUuid,
                metricQueryOfSemanticNode(node),
            ),
        ).toThrow(ForbiddenError);
    });

    test('refuses another account or project', () => {
        const query = metricQueryOfSemanticNode(ordersNode);
        expect(() =>
            context.assertMetricQuery(
                otherAccount as Account,
                projectUuid,
                query,
            ),
        ).toThrow(ForbiddenError);
        expect(() =>
            context.assertMetricQuery(
                account as Account,
                'another-project',
                query,
            ),
        ).toThrow(ForbiddenError);
    });
});
