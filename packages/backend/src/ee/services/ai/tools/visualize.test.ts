import {
    DimensionType,
    QuerySourceType,
    type AiArtifact,
    type AiWebAppPrompt,
    type ThreadComposerQueryNode,
    type ToolVisualizeArgs,
    type ToolVisualizeOutput,
} from '@lightdash/common';
import type {
    CreateOrUpdateArtifactFn,
    RunComposerQueriesFn,
} from '../types/aiAgentDependencies';
import { getVisualize } from './visualize';

const prompt = {
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
} as AiWebAppPrompt;

const ordersNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by month and status',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const shareNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'share',
    title: 'Share by status',
    sql: 'SELECT orders_status, sum(orders_total_order_amount) AS amount FROM orders GROUP BY 1',
    references: ['orders'],
    limit: 500,
};

const unrelatedNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'signups',
    title: 'Signups',
    sql: 'SELECT 1',
    limit: 500,
};

const barConfig: ToolVisualizeArgs['vizConfig'] = {
    type: 'bar',
    x: 'orders_order_date_month',
    y: ['orders_total_order_amount'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

const makeRun = (
    rows: Record<string, unknown>[],
): Awaited<ReturnType<RunComposerQueriesFn>> => ({
    submissions: [],
    terminal: {
        queryUuid: 'query-uuid',
        columns: {
            orders_order_date_month: {
                reference: 'orders_order_date_month',
                type: DimensionType.DATE,
            },
            orders_status: {
                reference: 'orders_status',
                type: DimensionType.STRING,
            },
            orders_total_order_amount: {
                reference: 'orders_total_order_amount',
                type: DimensionType.NUMBER,
            },
        },
        rows,
        rowCount: rows.length,
    },
});

const makeTool = ({
    threadNodes = [ordersNode, shareNode, unrelatedNode],
    rows = [],
}: {
    threadNodes?: ThreadComposerQueryNode[];
    rows?: Record<string, unknown>[];
} = {}) => {
    const versions: Parameters<CreateOrUpdateArtifactFn>[0][] = [];
    const runComposerQueries = vi.fn(async () => makeRun(rows));
    const tool = getVisualize({
        getPrompt: async () => prompt,
        listThreadComposerQueryNodes: async () => threadNodes,
        runComposerQueries,
        createOrUpdateArtifact: async (data) => {
            versions.push(data);
            return {
                artifactUuid: 'artifact-uuid',
                versionUuid: `version-${versions.length}`,
            } as AiArtifact;
        },
        updateProgress: async () => {},
    });
    const visualize = (args: Partial<ToolVisualizeArgs> = {}) =>
        tool.execute!(
            {
                nodeId: 'orders',
                title: 'Order amount by month',
                description: null,
                vizConfig: barConfig,
                ...args,
            },
            { messages: [], toolCallId: 'call', context: {} },
        ) as Promise<ToolVisualizeOutput>;
    return { visualize, versions, runComposerQueries };
};

describe('visualize', () => {
    it('writes a composer v2 version of the node and what it reads, without running it', async () => {
        const { visualize, versions, runComposerQueries } = makeTool();

        const output = await visualize({
            nodeId: 'share',
            title: 'Amount by status',
            description: 'Order amount per status.',
            vizConfig: { ...barConfig, x: 'orders_status', y: ['amount'] },
        });

        expect(output.metadata).toEqual({
            status: 'success',
            nodeId: 'share',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-1',
        });
        expect(versions).toEqual([
            {
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                artifactType: 'chart',
                title: 'Amount by status',
                description: 'Order amount per status.',
                vizConfig: {
                    source: 'composer',
                    schemaVersion: 2,
                    queries: [ordersNode, shareNode],
                    terminalNodeId: 'share',
                    vizConfig: {
                        ...barConfig,
                        x: 'orders_status',
                        y: ['amount'],
                    },
                },
            },
        ]);
        expect(runComposerQueries).not.toHaveBeenCalled();
    });

    it('draws a stacked bar by status from a series split', async () => {
        const { visualize, versions, runComposerQueries } = makeTool({
            rows: [
                { orders_status: 'completed' },
                { orders_status: 'returned' },
            ],
        });
        const stacked = {
            ...barConfig,
            groupBy: ['orders_status'],
            stack: true,
        };

        const output = await visualize({ vizConfig: stacked });

        expect(output.metadata.status).toBe('success');
        expect(output.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [],
        });
        expect(versions[0].vizConfig).toMatchObject({
            schemaVersion: 2,
            terminalNodeId: 'orders',
            vizConfig: stacked,
        });
        expect(runComposerQueries).toHaveBeenCalledWith({
            queries: [ordersNode],
            terminalNodeId: 'orders',
        });
    });

    it('writes the card without hints when the hint run fails', async () => {
        const { visualize, versions, runComposerQueries } = makeTool();
        runComposerQueries.mockRejectedValueOnce(new Error('warehouse down'));

        const output = await visualize({
            vizConfig: { ...barConfig, type: 'pie', x: 'orders_status' },
        });

        expect(output.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [],
        });
        expect(versions).toHaveLength(1);
    });

    it('writes one version per call, so two calls show two cards', async () => {
        const { visualize, versions } = makeTool();

        await visualize();
        await visualize({ vizConfig: { ...barConfig, type: 'line' } });

        expect(versions).toHaveLength(2);
        expect(versions.map((v) => v.vizConfig.vizConfig)).toEqual([
            barConfig,
            { ...barConfig, type: 'line' },
        ]);
    });

    it("rejects a node id outside the thread's nodes, naming them", async () => {
        const { visualize, versions } = makeTool({
            threadNodes: [ordersNode],
        });

        const output = await visualize({ nodeId: 'revenue' });

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('"revenue"');
        expect(output.result).toContain(
            'orders ("Orders by month and status")',
        );
        expect(versions).toEqual([]);
    });

    it('notes a pie with many slices and a split with many series', async () => {
        const rows = Array.from({ length: 13 }, (_, i) => ({
            orders_order_date_month: `2026-${i}`,
            orders_status: `status-${i}`,
        }));
        const { visualize, versions } = makeTool({ rows });

        const pie = await visualize({
            vizConfig: { ...barConfig, type: 'pie', x: 'orders_status' },
        });
        const split = await visualize({
            vizConfig: { ...barConfig, groupBy: ['orders_status'] },
        });

        expect(pie.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [
                'This pie has 13 categories; a bar chart or table will make comparisons easier.',
            ],
        });
        expect(pie.result).toContain('a bar chart or table');
        expect(split.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [
                'This chart has 13 series; consider a table or an explicitly requested narrower grouping.',
            ],
        });
        expect(versions).toHaveLength(2);
    });
});
