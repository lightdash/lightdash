import {
    QuerySourceType,
    type AiComposerChartArtifactConfig,
    type AiWebAppPrompt,
    type SemanticLayerSourceQuery,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';
import { EMPTY_QUERY_GUIDANCE } from '../decisions/queryReview';
import type { QueryReviewer } from '../decisions/queryReview';
import { getRunComposerQueries } from './runComposerQueries';

type ComposerTool = ReturnType<typeof getRunComposerQueries>;
type ComposerOutput = {
    result: string;
    metadata?: { status: string };
};

const makePrompt = (): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Join revenue with signups',
    createdAt: new Date('2026-05-19T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
    battleProfile: null,
});

type ComposerNode = ToolComposerQueriesArgs['queries'][number];

const semanticNode: ComposerNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'revenue',
    title: 'Revenue by month',
    description: null,
    exploreName: 'payments',
    dimensions: ['payments_month'],
    metrics: ['payments_total_revenue'],
    filters: null,
    sorts: null,
    limit: 500,
};

const sqlNode: ComposerNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'signups',
    title: 'Signups by month',
    description: null,
    sql: 'SELECT month, count(*) AS signups FROM raw.users GROUP BY 1',
    limit: 500,
};

const duckdbNode: ComposerNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'joined',
    title: 'Revenue vs signups',
    description: 'Joins monthly revenue with monthly signups.',
    sql: 'SELECT * FROM revenue JOIN signups USING (month)',
    references: ['revenue', 'signups'],
    limit: 500,
};

const externalNode: ComposerNode = {
    sourceType: QuerySourceType.EXTERNAL,
    nodeId: 'targets',
    title: 'Targets by region',
    description: null,
    sql: 'SELECT region, target FROM targets',
    tables: {
        targets: '2b7cd26e-1b5a-4aaf-9955-e25c381c501f',
    },
    limit: 500,
};

const makeArgs = (
    overrides: Partial<ToolComposerQueriesArgs> = {},
): ToolComposerQueriesArgs => ({
    title: 'Revenue vs signups',
    description: null,
    queries: [semanticNode, sqlNode, duckdbNode],
    terminalNodeId: null,
    ...overrides,
});

const executeTool = (
    tool: ComposerTool,
    args: ToolComposerQueriesArgs,
    toolCallId: string = 'tool-call-1',
) =>
    tool.execute!(args, {
        messages: [],
        toolCallId,
        context: {},
    }) as Promise<ComposerOutput>;

const makeTool = ({
    reviewQuery,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    canRunSql = true,
    enableDataAccess = true,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
}: {
    reviewQuery?: QueryReviewer;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    canRunSql?: boolean;
    enableDataAccess?: boolean;
    waitForSqlApproval?: import('vitest').Mock;
} = {}) => {
    const dependencies = {
        reviewQuery,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runComposerQueries: vi.fn().mockResolvedValue({
            submissions: [
                {
                    nodeId: 'revenue',
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    queryUuid: 'query-1',
                },
                {
                    nodeId: 'signups',
                    sourceType: QuerySourceType.SQL,
                    queryUuid: 'query-2',
                },
                {
                    nodeId: 'joined',
                    sourceType: QuerySourceType.DUCKDB,
                    queryUuid: 'query-3',
                },
            ],
            terminal: {
                queryUuid: 'query-3',
                columns: {
                    month: { reference: 'month', type: 'string' },
                    signups: { reference: 'signups', type: 'number' },
                },
                rows: [{ month: '2026-01', signups: 12 }],
                rowCount: 1,
            },
        }),
        getPrompt: vi.fn().mockResolvedValue(makePrompt()),
        waitForSqlApproval,
        recordSqlApproval: vi.fn().mockResolvedValue(true),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        listThreadComposerPipelines: vi.fn().mockResolvedValue([]),
        maxQueryLimit: 5000,
        enableDataAccess,
        canRunSql,
        autoApproveSql,
        autoApproveSqlUserUuid,
    };

    return {
        tool: getRunComposerQueries(dependencies),
        dependencies,
    };
};

describe('getRunComposerQueries', () => {
    it('runs the pipeline, stores a composer artifact and returns the terminal snapshot', async () => {
        const { tool, dependencies } = makeTool({ autoApproveSql: true });

        const output = await executeTool(tool, makeArgs());

        expect(dependencies.runComposerQueries).toHaveBeenCalledWith({
            queries: [
                expect.objectContaining({ nodeId: 'revenue' }),
                expect.objectContaining({ nodeId: 'signups' }),
                expect.objectContaining({ nodeId: 'joined' }),
            ],
            terminalNodeId: 'joined',
            onNodeStatus: expect.any(Function),
        });
        expect(dependencies.createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                artifactType: 'chart',
                title: 'Revenue vs signups',
                vizConfig: expect.objectContaining({
                    source: 'composer',
                    schemaVersion: 1,
                    queries: [
                        expect.objectContaining({
                            nodeId: 'revenue',
                            title: 'Revenue by month',
                        }),
                        expect.objectContaining({
                            nodeId: 'signups',
                            title: 'Signups by month',
                        }),
                        expect.objectContaining({
                            nodeId: 'joined',
                            title: 'Revenue vs signups',
                            description:
                                'Joins monthly revenue with monthly signups.',
                        }),
                    ],
                    terminalNodeId: 'joined',
                    lastQueryUuid: 'query-3',
                    nodeResults: {
                        revenue: { queryUuid: 'query-1' },
                        signups: { queryUuid: 'query-2' },
                        joined: { queryUuid: 'query-3' },
                    },
                }),
            }),
        );
        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain('query-3');
        expect(output.result).toContain('```csv');
    });

    it('defaults the terminal node to the unique sink', async () => {
        const { tool, dependencies } = makeTool({ autoApproveSql: true });

        await executeTool(
            tool,
            makeArgs({
                queries: [
                    semanticNode,
                    { ...duckdbNode, references: ['revenue'] },
                ],
            }),
        );

        expect(dependencies.runComposerQueries).toHaveBeenCalledWith(
            expect.objectContaining({ terminalNodeId: 'joined' }),
        );
    });

    it('requires an explicit terminal node when the pipeline has multiple sinks', async () => {
        const { tool, dependencies } = makeTool({ autoApproveSql: true });

        const output = await executeTool(
            tool,
            makeArgs({
                queries: [semanticNode, sqlNode],
                terminalNodeId: null,
            }),
        );

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('terminalNodeId');
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });

    it('rejects sql nodes when SQL execution is disabled without asking for approval', async () => {
        const { tool, dependencies } = makeTool({ canRunSql: false });

        const output = await executeTool(tool, makeArgs());

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('sql');
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });

    it('waits for approval when the pipeline contains sql nodes', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeTool(tool, makeArgs());

        expect(dependencies.waitForSqlApproval).toHaveBeenCalledWith(
            'tool-call-1',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Awaiting approval to run SQL...',
        );
        expect(output.metadata?.status).toBe('success');
    });

    it('skips approval for pipelines without sql nodes', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeTool(
            tool,
            makeArgs({
                queries: [
                    semanticNode,
                    { ...duckdbNode, references: ['revenue'] },
                ],
            }),
        );

        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.recordSqlApproval).not.toHaveBeenCalled();
        expect(output.metadata?.status).toBe('success');
    });

    it('passes attached external tables through without SQL approval', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeTool(
            tool,
            makeArgs({ queries: [externalNode] }),
        );

        expect(dependencies.runComposerQueries).toHaveBeenCalledWith({
            queries: [
                {
                    ...externalNode,
                    description: undefined,
                    tables: {
                        targets: '2b7cd26e-1b5a-4aaf-9955-e25c381c501f',
                    },
                },
            ],
            terminalNodeId: 'targets',
            onNodeStatus: expect.any(Function),
        });
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(output.metadata?.status).toBe('success');
    });

    it('composes semantic layer results with an attached external table', async () => {
        const { tool, dependencies } = makeTool();
        const composedNode: ComposerNode = {
            ...duckdbNode,
            sql: 'SELECT revenue.*, targets.target FROM revenue JOIN targets USING (region)',
            references: ['revenue', 'targets'],
        };

        const output = await executeTool(
            tool,
            makeArgs({
                queries: [semanticNode, externalNode, composedNode],
            }),
        );

        expect(dependencies.runComposerQueries).toHaveBeenCalledWith({
            queries: [
                {
                    ...semanticNode,
                    description: undefined,
                    filters: undefined,
                    sorts: undefined,
                },
                { ...externalNode, description: undefined },
                composedNode,
            ],
            terminalNodeId: 'joined',
            onNodeStatus: expect.any(Function),
        });
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(output.metadata?.status).toBe('success');
    });

    it('auto-approves sql nodes when the agent auto-approves SQL', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
            autoApproveSqlUserUuid: 'user-uuid',
        });

        await executeTool(tool, makeArgs());

        expect(dependencies.recordSqlApproval).toHaveBeenCalledWith(
            'tool-call-1',
            'approved',
            'user-uuid',
        );
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
    });

    it('returns rejected without executing when the user rejects the SQL', async () => {
        const waitForSqlApproval = vi.fn().mockResolvedValue('rejected');
        const { tool, dependencies } = makeTool({ waitForSqlApproval });

        const output = await executeTool(tool, makeArgs());

        expect(output.metadata?.status).toBe('rejected');
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
        expect(dependencies.createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it('does not open another approval wait after approval times out', async () => {
        const waitForSqlApproval = vi.fn().mockResolvedValue('timeout');
        const { tool, dependencies } = makeTool({ waitForSqlApproval });

        const firstOutput = await executeTool(tool, makeArgs(), 'tool-call-1');
        const secondOutput = await executeTool(tool, makeArgs(), 'tool-call-2');

        expect(firstOutput.metadata?.status).toBe('timeout');
        expect(secondOutput.metadata?.status).toBe('timeout');
        expect(dependencies.waitForSqlApproval).toHaveBeenCalledTimes(1);
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });

    it('rejects non-SELECT sql nodes before approval', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeTool(
            tool,
            makeArgs({
                queries: [
                    { ...sqlNode, sql: 'DROP TABLE raw.users' },
                    { ...duckdbNode, references: ['signups'] },
                ],
            }),
        );

        expect(output.metadata?.status).toBe('error');
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });

    it('forwards per-node status updates as attributed step-progress events', async () => {
        const { tool, dependencies } = makeTool({ autoApproveSql: true });
        dependencies.runComposerQueries.mockImplementation(
            async ({
                onNodeStatus,
            }: {
                onNodeStatus?: (update: {
                    nodeId: string;
                    queryUuid: string;
                    status: 'running' | 'success' | 'error';
                    errorMessage: string | null;
                }) => void;
            }) => {
                onNodeStatus?.({
                    nodeId: 'revenue',
                    queryUuid: 'query-1',
                    status: 'running',
                    errorMessage: null,
                });
                onNodeStatus?.({
                    nodeId: 'revenue',
                    queryUuid: 'query-1',
                    status: 'success',
                    errorMessage: null,
                });
                onNodeStatus?.({
                    nodeId: 'joined',
                    queryUuid: 'query-3',
                    status: 'error',
                    errorMessage: 'column not found',
                });
                return {
                    submissions: [
                        {
                            nodeId: 'revenue',
                            sourceType: QuerySourceType.SEMANTIC_LAYER,
                            queryUuid: 'query-1',
                        },
                    ],
                    terminal: {
                        queryUuid: 'query-1',
                        columns: {},
                        rows: [],
                        rowCount: 0,
                    },
                };
            },
        );

        await executeTool(tool, makeArgs());

        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Running query "revenue"...',
            'runComposerQueries',
            'tool-call-1:revenue',
            'in_progress',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Query "revenue" complete',
            'runComposerQueries',
            'tool-call-1:revenue',
            'complete',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Query "joined" failed: column not found',
            'runComposerQueries',
            'tool-call-1:joined',
            'error',
        );
    });

    it('returns only a summary when data access is disabled', async () => {
        const { tool } = makeTool({
            autoApproveSql: true,
            enableDataAccess: false,
        });

        const output = await executeTool(tool, makeArgs());

        expect(output.metadata?.status).toBe('success');
        expect(output.result).not.toContain('```csv');
        expect(output.result).toContain('query-3');
    });
});

const ORDERS_UUID = 'bcf89bb4-1111-4aaa-8bbb-000000000001';
const CUSTOMERS_UUID = '5e0a91c2-2222-4aaa-8bbb-000000000002';
const ENRICHED_UUID = '7d3f22a0-3333-4aaa-8bbb-000000000003';
const RANKED_UUID = 'a41c9e07-4444-4aaa-8bbb-000000000004';

const ordersNode: SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by customer',
    exploreName: 'orders',
    dimensions: ['orders_customer_id'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const customersNode: SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'customers',
    title: 'Customers',
    exploreName: 'customers',
    dimensions: ['customers_customer_id', 'customers_first_name'],
    metrics: [],
    limit: 500,
};

const version1: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    queries: [
        ordersNode,
        customersNode,
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'enriched',
            title: 'Orders with customer names',
            sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customers_customer_id',
            references: ['orders', 'customers'],
            limit: 500,
        },
    ],
    terminalNodeId: 'enriched',
    lastQueryUuid: ENRICHED_UUID,
    nodeResults: {
        orders: { queryUuid: ORDERS_UUID },
        customers: { queryUuid: CUSTOMERS_UUID },
        enriched: { queryUuid: ENRICHED_UUID },
    },
};

// Reused v1's enriched, so its pipeline already carries suffixed copies
const version2: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    queries: [
        { ...ordersNode, nodeId: 'orders_bcf89bb4' },
        { ...customersNode, nodeId: 'customers_5e0a91c2' },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'enriched_7d3f22a0',
            title: 'Orders with customer names',
            sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customers_customer_id',
            references: {
                orders: 'orders_bcf89bb4',
                customers: 'customers_5e0a91c2',
            },
            limit: 500,
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'ranked',
            title: 'Customers ranked by spend',
            sql: 'SELECT *, rank() OVER (ORDER BY orders_total_order_amount DESC) AS spend_rank FROM enriched',
            references: { enriched: 'enriched_7d3f22a0' },
            limit: 500,
        },
    ],
    terminalNodeId: 'ranked',
    lastQueryUuid: RANKED_UUID,
    nodeResults: {
        orders_bcf89bb4: { queryUuid: ORDERS_UUID },
        customers_5e0a91c2: { queryUuid: CUSTOMERS_UUID },
        enriched_7d3f22a0: { queryUuid: ENRICHED_UUID },
        ranked: { queryUuid: RANKED_UUID },
    },
};

const readerNode = (
    references: Record<string, string>,
    nodeId = 'summary',
): ComposerNode => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    title: 'Spend summary',
    description: null,
    sql: 'SELECT count(*) FROM o',
    references,
    limit: 500,
});

const runReuse = async ({
    queries,
    earlierPipelines,
}: {
    queries: ComposerNode[];
    earlierPipelines: AiComposerChartArtifactConfig[];
}) => {
    const { tool, dependencies } = makeTool();
    dependencies.listThreadComposerPipelines.mockResolvedValue(
        earlierPipelines,
    );
    const submissions = queries.map((node, index) => ({
        nodeId: node.nodeId,
        sourceType: node.sourceType,
        queryUuid: `run-query-${index}`,
    }));
    dependencies.runComposerQueries.mockResolvedValue({
        submissions,
        terminal: {
            queryUuid: submissions[submissions.length - 1].queryUuid,
            columns: {},
            rows: [],
            rowCount: 0,
        },
    });

    const output = await executeTool(
        tool,
        makeArgs({
            queries,
            terminalNodeId: queries[queries.length - 1].nodeId,
        }),
    );

    const [{ vizConfig }] = dependencies.createOrUpdateArtifact.mock.calls[0];
    return { output, vizConfig: vizConfig as AiComposerChartArtifactConfig };
};

describe('composer artifact with reused nodes', () => {
    it('copies nodes reused from an earlier version and rewrites the reader', async () => {
        const { output, vizConfig } = await runReuse({
            queries: [readerNode({ o: ORDERS_UUID, c: CUSTOMERS_UUID })],
            earlierPipelines: [version1],
        });

        expect(vizConfig.queries).toEqual([
            { ...ordersNode, nodeId: 'orders_bcf89bb4' },
            { ...customersNode, nodeId: 'customers_5e0a91c2' },
            expect.objectContaining({
                nodeId: 'summary',
                references: { o: 'orders_bcf89bb4', c: 'customers_5e0a91c2' },
            }),
        ]);
        expect(vizConfig.nodeResults).toEqual({
            orders_bcf89bb4: { queryUuid: ORDERS_UUID },
            customers_5e0a91c2: { queryUuid: CUSTOMERS_UUID },
            summary: { queryUuid: 'run-query-0' },
        });
        expect(vizConfig.terminalNodeId).toBe('summary');
        expect(vizConfig.lastQueryUuid).toBe('run-query-0');
        expect(output.result).toContain(
            '- summary (duckdb): queryUuid run-query-0',
        );
        expect(output.result).not.toContain('orders_bcf89bb4');
    });

    it('copies a reused transformation with its reads, converting array references to map form', async () => {
        const { vizConfig } = await runReuse({
            queries: [readerNode({ e: ENRICHED_UUID })],
            earlierPipelines: [version1],
        });

        expect(vizConfig.queries.map((node) => node.nodeId)).toEqual([
            'orders_bcf89bb4',
            'customers_5e0a91c2',
            'enriched_7d3f22a0',
            'summary',
        ]);
        expect(vizConfig.queries[2]).toEqual(
            expect.objectContaining({
                sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customers_customer_id',
                references: {
                    orders: 'orders_bcf89bb4',
                    customers: 'customers_5e0a91c2',
                },
            }),
        );
        expect(vizConfig.queries[3]).toEqual(
            expect.objectContaining({ references: { e: 'enriched_7d3f22a0' } }),
        );
        expect(Object.keys(vizConfig.nodeResults ?? {})).toEqual(
            vizConfig.queries.map((node) => node.nodeId),
        );
    });

    it('copies a node reached directly from v1 and transitively via v2 once', async () => {
        const { vizConfig } = await runReuse({
            queries: [readerNode({ o: ORDERS_UUID, r: RANKED_UUID })],
            earlierPipelines: [version1, version2],
        });

        expect(vizConfig.queries.map((node) => node.nodeId)).toEqual([
            'orders_bcf89bb4',
            'customers_5e0a91c2',
            'enriched_7d3f22a0',
            'ranked_a41c9e07',
            'summary',
        ]);
        expect(vizConfig.queries[3]).toEqual(
            expect.objectContaining({
                references: { enriched: 'enriched_7d3f22a0' },
            }),
        );
        expect(vizConfig.queries[4]).toEqual(
            expect.objectContaining({
                references: { o: 'orders_bcf89bb4', r: 'ranked_a41c9e07' },
            }),
        );
        expect(vizConfig.nodeResults).toEqual({
            orders_bcf89bb4: { queryUuid: ORDERS_UUID },
            customers_5e0a91c2: { queryUuid: CUSTOMERS_UUID },
            enriched_7d3f22a0: { queryUuid: ENRICHED_UUID },
            ranked_a41c9e07: { queryUuid: RANKED_UUID },
            summary: { queryUuid: 'run-query-0' },
        });
    });

    it('leaves an unknown queryUuid untouched and invents no node', async () => {
        const unknownUuid = '99999999-5555-4aaa-8bbb-000000000005';
        const { vizConfig } = await runReuse({
            queries: [readerNode({ o: ORDERS_UUID, prev: unknownUuid })],
            earlierPipelines: [version1],
        });

        expect(vizConfig.queries.map((node) => node.nodeId)).toEqual([
            'orders_bcf89bb4',
            'summary',
        ]);
        expect(vizConfig.queries[1]).toEqual(
            expect.objectContaining({
                references: { o: 'orders_bcf89bb4', prev: unknownUuid },
            }),
        );
    });

    it('keeps copied ids within the node id grammar and unique against this run', async () => {
        const longId = `orders_${'x'.repeat(70)}`;
        const { vizConfig } = await runReuse({
            queries: [
                readerNode(
                    { o: ORDERS_UUID, c: CUSTOMERS_UUID },
                    'customers_5e0a91c2',
                ),
            ],
            earlierPipelines: [
                {
                    ...version1,
                    queries: [{ ...ordersNode, nodeId: longId }, customersNode],
                    nodeResults: {
                        [longId]: { queryUuid: ORDERS_UUID },
                        customers: { queryUuid: CUSTOMERS_UUID },
                    },
                },
            ],
        });

        const nodeIds = vizConfig.queries.map((node) => node.nodeId);
        expect(nodeIds).toEqual([
            `orders_${'x'.repeat(47)}_bcf89bb4`,
            'customers_5e0a91c22222',
            'customers_5e0a91c2',
        ]);
        expect(new Set(nodeIds).size).toBe(nodeIds.length);
        nodeIds.forEach((nodeId) =>
            expect(nodeId).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/),
        );
        expect(Object.keys(vizConfig.nodeResults ?? {})).toEqual(nodeIds);
    });

    it("stores only this run's nodes without an earlier artifact", async () => {
        const { vizConfig } = await runReuse({
            queries: [
                semanticNode,
                readerNode({ o: 'revenue', prev: ORDERS_UUID }),
            ],
            earlierPipelines: [],
        });

        expect(vizConfig.queries).toEqual([
            expect.objectContaining({ nodeId: 'revenue' }),
            expect.objectContaining({
                nodeId: 'summary',
                references: { o: 'revenue', prev: ORDERS_UUID },
            }),
        ]);
        expect(vizConfig.nodeResults).toEqual({
            revenue: { queryUuid: 'run-query-0' },
            summary: { queryUuid: 'run-query-1' },
        });
    });
});

describe('composer query review', () => {
    it('reviews the complete executable pipeline and its resolved terminal in one call', async () => {
        const reviewQuery = vi
            .fn()
            .mockResolvedValue(' Query/question review: check grain.');
        const { tool, dependencies } = makeTool({ reviewQuery });
        const args = makeArgs();
        const before = structuredClone(args);
        const output = await executeTool(tool, args);
        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain('check grain');
        expect(dependencies.runComposerQueries).toHaveBeenCalledOnce();
        expect(reviewQuery).toHaveBeenCalledExactlyOnceWith({
            kind: 'composer',
            queries: dependencies.runComposerQueries.mock.calls[0][0].queries,
            terminalNodeId: 'joined',
        });
        expect(args).toEqual(before);
    });
    it.each(['disabled', 'rejected'] as const)(
        'does not review composer queries when %s',
        async (reason) => {
            const reviewQuery = vi.fn().mockResolvedValue('advice');
            const { tool } = makeTool({
                reviewQuery,
                enableDataAccess: reason !== 'disabled',
                waitForSqlApproval: vi
                    .fn()
                    .mockResolvedValue(
                        reason === 'rejected' ? 'rejected' : 'approved',
                    ),
            });
            await executeTool(tool, makeArgs());
            expect(reviewQuery).not.toHaveBeenCalled();
        },
    );
    it('preserves scope and review advice for an empty terminal result', async () => {
        const reviewQuery = vi
            .fn()
            .mockResolvedValueOnce(' Query/question review: check conditions.')
            .mockResolvedValueOnce(
                `${EMPTY_QUERY_GUIDANCE} Query/question review: check conditions.`,
            );
        const { tool, dependencies } = makeTool({ reviewQuery });
        dependencies.runComposerQueries.mockResolvedValue({
            submissions: [],
            terminal: {
                queryUuid: 'empty',
                columns: {},
                rows: [],
                rowCount: 0,
            },
        });
        const output = await executeTool(tool, makeArgs());
        expect(output.result).toContain('Preserve the user’s scope');
        expect(output.result).toContain('check conditions');
    });
});
