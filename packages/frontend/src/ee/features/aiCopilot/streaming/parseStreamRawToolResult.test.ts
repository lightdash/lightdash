import { parseStreamRawToolCall } from './parseStreamRawToolResult';

const expressionToolArgs = {
    title: 'Orders by status',
    description: 'Order count by status',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        sorts: [],
        limit: 500,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters: {
            dimensions: 'orders_status equals=complete',
            metrics: null,
            tableCalculations: null,
        },
    },
    chartConfig: null,
};

describe('parseStreamRawToolCall', () => {
    it('keeps filter-expression visualization cards in the stream', () => {
        expect(
            parseStreamRawToolCall({
                toolName: 'generateVisualization',
                toolArgs: expressionToolArgs,
            }),
        ).toMatchObject({
            toolName: 'generateVisualization',
            toolArgs: {
                queryConfig: {
                    filters: {
                        dimensions: 'orders_status equals=complete',
                    },
                },
            },
        });
    });

    it('keeps merge-disabled expression cards with legacy table calculations', () => {
        expect(
            parseStreamRawToolCall({
                toolName: 'generateVisualization',
                toolArgs: {
                    ...expressionToolArgs,
                    queryConfig: {
                        ...expressionToolArgs.queryConfig,
                        tableCalculations: [
                            {
                                type: 'running_total',
                                name: 'running_orders',
                                displayName: 'Running orders',
                                fieldId: 'orders_count',
                            },
                        ],
                    },
                },
            }),
        ).toMatchObject({
            toolName: 'generateVisualization',
            toolArgs: {
                queryConfig: {
                    tableCalculations: [
                        {
                            type: 'running_total',
                            name: 'running_orders',
                        },
                    ],
                },
            },
        });
    });
});
