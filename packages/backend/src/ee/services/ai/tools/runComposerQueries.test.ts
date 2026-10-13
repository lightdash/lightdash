import {
    ChartKind,
    QuerySourceType,
    VizAggregationOptions,
    VizIndexType,
    type AiComposerChartArtifactConfig,
    type AiWebAppPrompt,
    type SemanticLayerSourceQuery,
    type SourceQuery,
    type ToolComposerQueriesArgs,
    type ToolComposerQueriesOutput,
} from '@lightdash/common';
import type { ZodType } from 'zod';
import { EMPTY_QUERY_GUIDANCE } from '../decisions/queryReview';
import type { QueryReviewer } from '../decisions/queryReview';
import type { PlanComposerViz } from '../decisions/vizPlanner';
import {
    getRunComposerQueries,
    resolveTerminalNodeId,
} from './runComposerQueries';

type ComposerTool = ReturnType<typeof getRunComposerQueries>;
type ComposerOutput = ToolComposerQueriesOutput;

const makePrompt = (): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    threadEmbedSpaceUuid: null,
    externalUserId: null,
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

const pythonNode: ComposerNode = {
    sourceType: QuerySourceType.PYTHON,
    nodeId: 'forecast',
    title: 'Revenue forecast',
    description: null,
    code: 'def run(inputs, params):\n    return inputs["revenue"]',
    references: ['revenue'],
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
    planViz,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    canRunSql = true,
    enablePythonNodes = false,
    enableDataAccess = true,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
}: {
    reviewQuery?: QueryReviewer;
    planViz?: PlanComposerViz;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    canRunSql?: boolean;
    enablePythonNodes?: boolean;
    enableDataAccess?: boolean;
    waitForSqlApproval?: import('vitest').Mock;
} = {}) => {
    const dependencies = {
        reviewQuery,
        planViz,
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
        trackSqlApprovalTimeout: vi.fn(),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        listThreadComposerPipelines: vi.fn().mockResolvedValue([]),
        maxQueryLimit: 5000,
        enableDataAccess,
        canRunSql,
        enablePythonNodes,
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
            }),
        );
        const [{ vizConfig }] =
            dependencies.createOrUpdateArtifact.mock.calls[0];
        expect(Object.keys(vizConfig)).toEqual([
            'source',
            'schemaVersion',
            'queries',
            'terminalNodeId',
            'vizConfig',
        ]);
        expect(vizConfig).toEqual({
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
                    description: 'Joins monthly revenue with monthly signups.',
                }),
            ],
            terminalNodeId: 'joined',
            vizConfig: null,
        });
        expect(output.metadata?.status).toBe('success');
        expect(output.result).toContain(
            [
                'Composer query complete. Terminal node "joined" returned 1 rows.',
                'Nodes in this pipeline (a later call can read any of them by node id without resubmitting it):',
                '- revenue: "Revenue by month" (semanticLayer)',
                '- signups: "Signups by month" (sql)',
                '- joined: "Revenue vs signups" (duckdb)',
                'Terminal columns: month (string), signups (number).',
            ].join('\n'),
        );
        expect(output.result).toContain('```csv');
        expect(output.result).not.toContain('query-');
        expect(output.structuredContent).toEqual({
            terminalNodeId: 'joined',
            rowCount: 1,
            nodes: [
                {
                    nodeId: 'revenue',
                    title: 'Revenue by month',
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                },
                {
                    nodeId: 'signups',
                    title: 'Signups by month',
                    sourceType: QuerySourceType.SQL,
                },
                {
                    nodeId: 'joined',
                    title: 'Revenue vs signups',
                    sourceType: QuerySourceType.DUCKDB,
                },
            ],
            columns: [
                { reference: 'month', type: 'string' },
                { reference: 'signups', type: 'number' },
            ],
            visualization: expect.any(String),
            review: null,
            preview: {
                rows: [{ month: '2026-01', signups: 12 }],
                truncated: false,
            },
        });
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

        expect(dependencies.recordSqlApproval).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'runComposerQueries',
            decidedByUserUuid: 'user-uuid',
            source: 'auto_approve',
        });
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

    it('tracks a timed-out approval against the prompted web user', async () => {
        const waitForSqlApproval = vi.fn().mockResolvedValue('timeout');
        const { tool, dependencies } = makeTool({ waitForSqlApproval });

        await executeTool(tool, makeArgs());

        expect(
            dependencies.trackSqlApprovalTimeout,
        ).toHaveBeenCalledExactlyOnceWith({
            toolCallId: 'tool-call-1',
            toolName: 'runComposerQueries',
            promptedUserUuid: 'user-uuid',
            source: 'web',
        });
        expect(dependencies.recordSqlApproval).not.toHaveBeenCalled();
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
        expect(output.result).toContain(
            'Terminal node "joined" returned 1 rows.',
        );
        expect(output.result).not.toContain('query-');
    });
});

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

const enrichedNode: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'enriched',
    title: 'Orders with customer names',
    sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customers_customer_id',
    references: ['orders', 'customers'],
    limit: 500,
};

const rankedNode: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'ranked',
    title: 'Customers ranked by spend',
    sql: 'SELECT *, rank() OVER (ORDER BY orders_total_order_amount DESC) AS spend_rank FROM e',
    references: { e: 'enriched' },
    limit: 500,
};

const version1: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    queries: [ordersNode, customersNode, enrichedNode],
    terminalNodeId: 'enriched',
    vizConfig: null,
};

const version2: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    queries: [ordersNode, customersNode, enrichedNode, rankedNode],
    terminalNodeId: 'ranked',
    vizConfig: null,
};

const readerNode = (references: Record<string, string>): ComposerNode => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'summary',
    title: 'Spend summary',
    description: null,
    sql: 'SELECT count(*) FROM o',
    references,
    limit: 500,
});

const resubmittedOrders = (limit: number): ComposerNode => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by customer',
    description: null,
    exploreName: 'orders',
    dimensions: ['orders_customer_id'],
    metrics: ['orders_total_order_amount'],
    filters: null,
    sorts: null,
    limit,
});

const runReuse = async ({
    queries,
    earlierPipelines,
    terminalNodeId = null,
}: {
    queries: ComposerNode[];
    earlierPipelines: AiComposerChartArtifactConfig[];
    terminalNodeId?: string | null;
}) => {
    const { tool, dependencies } = makeTool();
    dependencies.listThreadComposerPipelines.mockResolvedValue(
        earlierPipelines,
    );
    // Warehouse boundary: every node gets a query id, the terminal returns one row
    dependencies.runComposerQueries.mockImplementation(
        async (args: { queries: SourceQuery[]; terminalNodeId: string }) => ({
            submissions: args.queries.map((node, index) => ({
                nodeId: node.nodeId,
                sourceType: node.sourceType,
                queryUuid: `run-query-${index}`,
            })),
            terminal: {
                queryUuid: `run-query-${args.queries.findIndex(
                    (node) => node.nodeId === args.terminalNodeId,
                )}`,
                columns: { total: { reference: 'total', type: 'number' } },
                rows: [{ total: 3 }],
                rowCount: 1,
            },
        }),
    );

    const output = await executeTool(
        tool,
        makeArgs({ queries, terminalNodeId }),
    );

    const stored = dependencies.createOrUpdateArtifact.mock.calls[0]?.[0]
        ?.vizConfig as AiComposerChartArtifactConfig | undefined;
    const executed = dependencies.runComposerQueries.mock.calls[0]?.[0] as
        | { queries: SourceQuery[]; terminalNodeId: string }
        | undefined;
    return { output, stored, executed, dependencies };
};

const nodeIdsOf = (queries: SourceQuery[] | undefined) =>
    queries?.map((node) => node.nodeId);

describe('composer artifact with reused nodes', () => {
    it('runs and stores a reused node and what it reads, without query ids', async () => {
        const { output, stored, executed } = await runReuse({
            queries: [readerNode({ o: 'enriched' })],
            earlierPipelines: [version1],
        });

        expect(executed?.terminalNodeId).toBe('summary');
        expect(executed?.queries).toEqual([
            ordersNode,
            customersNode,
            enrichedNode,
            expect.objectContaining({
                nodeId: 'summary',
                references: { o: 'enriched' },
            }),
        ]);
        expect(stored).toEqual({
            source: 'composer',
            schemaVersion: 1,
            queries: executed?.queries,
            terminalNodeId: 'summary',
            vizConfig: null,
        });
        expect(JSON.stringify(stored)).not.toContain('run-query');
        expect(output.result).toContain(
            [
                'Composer query complete. Terminal node "summary" returned 1 rows.',
                'Nodes in this pipeline (a later call can read any of them by node id without resubmitting it):',
                '- orders: "Orders by customer" (semanticLayer)',
                '- customers: "Customers" (semanticLayer)',
                '- enriched: "Orders with customer names" (duckdb)',
                '- summary: "Spend summary" (duckdb)',
                'Terminal columns: total (number).',
            ].join('\n'),
        );
        expect(JSON.stringify(output)).not.toContain('run-query');
    });

    it('copies a node reached directly and transitively once', async () => {
        const { executed } = await runReuse({
            queries: [readerNode({ o: 'orders', r: 'ranked' })],
            earlierPipelines: [version1, version2],
        });

        expect(nodeIdsOf(executed?.queries)).toEqual([
            'orders',
            'customers',
            'enriched',
            'ranked',
            'summary',
        ]);
    });

    it('shows a reused node when it is named as the terminal node', async () => {
        const { stored } = await runReuse({
            queries: [readerNode({ o: 'enriched' })],
            earlierPipelines: [version1],
            terminalNodeId: 'enriched',
        });

        expect(stored?.terminalNodeId).toBe('enriched');
    });

    it('accepts an unchanged earlier node resubmitted under its node id', async () => {
        const { output, executed } = await runReuse({
            queries: [resubmittedOrders(500), readerNode({ o: 'orders' })],
            earlierPipelines: [version1],
        });

        expect(output.metadata?.status).toBe('success');
        expect(nodeIdsOf(executed?.queries)).toEqual(['orders', 'summary']);
    });

    it('refuses a node id redefined with a different definition', async () => {
        const { output, executed, stored } = await runReuse({
            queries: [resubmittedOrders(10), readerNode({ o: 'orders' })],
            earlierPipelines: [version1],
        });

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain(
            'Node id "orders" already names a different node in this thread ("Orders by customer"). To reuse it, read "orders" without resubmitting it; to define a new node, give it a different node id.',
        );
        expect(executed).toBeUndefined();
        expect(stored).toBeUndefined();
    });

    it("refuses an unknown node id, listing the thread's node ids and titles", async () => {
        const { output, executed } = await runReuse({
            queries: [readerNode({ o: 'ordrs' })],
            earlierPipelines: [version1],
        });

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain(
            'Node "summary" reads "ordrs", which is not a node of this submission or of an earlier version in this thread. Nodes from earlier versions: orders ("Orders by customer"), customers ("Customers"), enriched ("Orders with customer names").',
        );
        expect(executed).toBeUndefined();
    });

    it('rejects a query id in the map form of references', () => {
        const parsed = (makeTool().tool.inputSchema as ZodType).safeParse(
            makeArgs({
                queries: [
                    readerNode({ o: '7d3f22a0-3333-4aaa-8bbb-000000000003' }),
                ],
            }),
        );

        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
            'References name node ids (letters, digits and underscores), not query ids',
        ]);
    });

    it('does not ask again for approval of sql it reuses from an earlier version', async () => {
        const approvedSql: SourceQuery = {
            sourceType: QuerySourceType.SQL,
            nodeId: 'signups',
            title: 'Signups by month',
            sql: 'SELECT month, count(*) AS signups FROM raw.users GROUP BY 1',
            limit: 500,
        };
        const { output, executed, dependencies } = await runReuse({
            queries: [readerNode({ o: 'signups' })],
            earlierPipelines: [
                {
                    ...version1,
                    queries: [approvedSql],
                    terminalNodeId: 'signups',
                },
            ],
        });

        expect(output.metadata?.status).toBe('success');
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(nodeIdsOf(executed?.queries)).toEqual(['signups', 'summary']);
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

describe('composer viz config', () => {
    it('stores the planned viz config on the artifact and names it in the result', async () => {
        const vizConfig = {
            type: ChartKind.VERTICAL_BAR,
            metadata: { version: 1 },
            fieldConfig: {
                x: { reference: 'month', type: VizIndexType.CATEGORY },
                y: [
                    {
                        reference: 'signups',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupBy: [],
            },
            display: undefined,
        } as const;
        const planViz = vi.fn().mockResolvedValue(vizConfig);
        const { tool, dependencies } = makeTool({ planViz });

        const output = await executeTool(tool, makeArgs());

        expect(
            dependencies.createOrUpdateArtifact.mock.calls[0][0].vizConfig
                .vizConfig,
        ).toEqual(vizConfig);
        expect(
            output.result.endsWith(
                'Visualization: bar chart, x = month, y = signups.',
            ),
        ).toBe(true);
    });
});

describe('python composer nodes', () => {
    it('treats python references as edges when resolving the terminal node', () => {
        expect(
            resolveTerminalNodeId([semanticNode, pythonNode], null, []),
        ).toBe('forecast');
        expect(
            resolveTerminalNodeId(
                [
                    semanticNode,
                    pythonNode,
                    {
                        ...duckdbNode,
                        references: { f: 'forecast' },
                    },
                ],
                null,
                [],
            ),
        ).toBe('joined');
        expect(() =>
            resolveTerminalNodeId(
                [semanticNode, { ...pythonNode, references: [] }],
                null,
                [],
            ),
        ).toThrow('2 sinks');
    });

    it('offers the python node in the input schema only when enabled', () => {
        const args = makeArgs({ queries: [semanticNode, pythonNode] });
        const accepts = (enablePythonNodes: boolean) =>
            (
                makeTool({ enablePythonNodes }).tool.inputSchema as ZodType
            ).safeParse(args).success;
        expect(accepts(false)).toBe(false);
        expect(accepts(true)).toBe(true);
        expect(makeTool().tool.description).not.toContain('"python"');
        expect(
            makeTool({ enablePythonNodes: true }).tool.description,
        ).toContain('"python"');
    });

    it('runs a python pipeline without SQL approval', async () => {
        const { tool, dependencies } = makeTool({ enablePythonNodes: true });

        await executeTool(
            tool,
            makeArgs({ queries: [semanticNode, pythonNode] }),
        );

        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.runComposerQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                terminalNodeId: 'forecast',
                queries: [
                    expect.objectContaining({ nodeId: 'revenue' }),
                    expect.objectContaining({
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'forecast',
                        code: pythonNode.code,
                        references: ['revenue'],
                    }),
                ],
            }),
        );
    });

    it('refuses python nodes when python queries are disabled', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeTool(
            tool,
            makeArgs({ queries: [semanticNode, pythonNode] }),
        );

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('python');
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });

    it('returns the python traceback to the model when the node fails', async () => {
        const { tool, dependencies } = makeTool({ enablePythonNodes: true });
        dependencies.runComposerQueries.mockRejectedValue(
            new Error(
                'Composer query failed on node(s): "forecast" (run() raised:\nTraceback (most recent call last):\nKeyError: \'amount\')',
            ),
        );

        const output = await executeTool(
            tool,
            makeArgs({ queries: [semanticNode, pythonNode] }),
        );

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('"forecast"');
        expect(output.result).toContain("KeyError: 'amount'");
    });
});
