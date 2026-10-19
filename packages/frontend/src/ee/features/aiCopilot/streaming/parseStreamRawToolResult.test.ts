import { AiAccessRefusalReason } from '@lightdash/common';
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

const pythonComposerArgs = {
    title: 'Simulated revenue',
    description: null,
    terminalNodeId: null,
    queries: [
        {
            sourceType: 'sql',
            nodeId: 'orders',
            title: 'Orders',
            description: null,
            sql: 'select amount from orders',
            limit: 500,
        },
        {
            sourceType: 'python',
            nodeId: 'sim',
            title: 'Simulation',
            description: null,
            code: 'def run(inputs, params):\n    return inputs["orders"]',
            references: ['orders'],
            limit: 20000,
        },
    ],
};

describe('runComposerQueries with python nodes', () => {
    it('keeps a complete python pipeline call', () => {
        expect(
            parseStreamRawToolCall({
                toolName: 'runComposerQueries',
                toolArgs: pythonComposerArgs,
            }),
        ).toMatchObject({
            toolName: 'runComposerQueries',
            toolArgs: {
                queries: [
                    { sourceType: 'sql' },
                    { sourceType: 'python', code: expect.any(String) },
                ],
            },
        });
    });

    it('keeps the failed result of a python pipeline', () => {
        const error = 'Composer query failed on node(s): "sim"';
        expect(
            parseStreamRawToolResult({
                toolName: 'runComposerQueries',
                toolArgs: pythonComposerArgs,
                toolOutput: {
                    result: error,
                    metadata: { status: 'error' },
                    structuredContent: { error },
                },
            }),
        ).toMatchObject({
            toolName: 'runComposerQueries',
            toolResult: { metadata: { status: 'error' } },
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

describe('AI access tool refusals', () => {
    it('preserves the refusal through output schema parsing', () => {
        const refusal = {
            code: 'ai_access_refused',
            reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            message: 'Not supported',
            action: null,
            settingsUrl: null,
            connectUrl: null,
        };
        expect(
            parseStreamRawToolResult({
                toolName: 'generateVisualization',
                toolArgs: expressionToolArgs,
                toolOutput: {
                    result: 'Not supported',
                    metadata: { status: 'error' },
                    structuredContent: { error: 'Not supported', refusal },
                },
            }),
        ).toMatchObject({ toolResult: { structuredContent: { refusal } } });
    });
});
