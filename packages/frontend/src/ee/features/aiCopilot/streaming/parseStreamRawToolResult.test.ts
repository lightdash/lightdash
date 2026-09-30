import {
    parseStreamRawToolCall,
    parseStreamRawToolResult,
} from './parseStreamRawToolResult';

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

describe('parseStreamRawToolResult', () => {
    it('keeps a Document edit so the open Document can refresh', () => {
        const parsed = parseStreamRawToolResult({
            toolName: 'editContent',
            toolArgs: {
                type: 'document',
                slug: 'q3-review',
                documentEdit: { type: 'metadata', name: 'Q3 review' },
            },
            toolOutput: {
                result: '<document href="/projects/p1/documents/doc-1" />',
                metadata: {
                    status: 'success',
                    slug: 'q3-review',
                    name: 'Q3 review',
                    uuid: 'doc-1',
                    href: '/projects/p1/documents/doc-1',
                    versionUuids: { before: null, after: 'v2' },
                    warnings: [],
                },
                structuredContent: {
                    type: 'document',
                    href: '/projects/p1/documents/doc-1',
                    uuid: 'doc-1',
                    versionUuid: 'v2',
                    content: {},
                    warnings: [],
                },
            },
            isPreliminary: false,
        });

        expect(parsed).toMatchObject({
            toolName: 'editContent',
            toolArgs: { type: 'document' },
            toolResult: { metadata: { status: 'success', uuid: 'doc-1' } },
        });
    });
});
