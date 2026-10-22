import {
    FilterOperator,
    getComposerNodeConflictMessage,
    isSameComposerNodeDefinition,
    ParameterError,
    QuerySourceType,
    toolComposerQueryNodeToSourceQuery,
    type AiWebAppPrompt,
    type SlackPrompt,
    type SourceQuery,
    type SubmittedSourceQuery,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesArgs,
    type ToolComposerQueriesOutput,
    type ToolComposerSemanticLayerNode,
} from '@lightdash/common';
import type { ZodType } from 'zod';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import { EMPTY_QUERY_GUIDANCE } from '../decisions/queryReview';
import type { QueryReviewer } from '../decisions/queryReview';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { getSlackTablePreviews } from '../utils/slackTablePreviews';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import { resolveComposerQueryNode } from './composerSemanticLayerFilters';
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

const makeSlackPrompt = (): SlackPrompt => ({
    ...makePrompt(),
    response_slack_ts: 'response-ts',
    slackUserId: 'slack-user',
    slackChannelId: 'slack-channel',
    promptSlackTs: 'prompt-ts',
    slackThreadTs: 'thread-ts',
});

// In-memory thread composer query nodes, with the model's register semantics.
const makeNodeRegistry = (initial: ThreadComposerQueryNode[] = []) => {
    const byThread = new Map<string, ThreadComposerQueryNode[]>([
        ['thread-uuid', [...initial]],
    ]);
    const list = (threadUuid: string) => byThread.get(threadUuid) ?? [];
    return {
        nodes: list,
        listThreadComposerQueryNodes: async (threadUuid: string) =>
            list(threadUuid),
        registerThreadComposerQueryNodes: async ({
            threadUuid,
            nodes,
        }: {
            threadUuid: string;
            nodes: ThreadComposerQueryNode[];
        }) => {
            const registered = list(threadUuid);
            nodes.forEach((node) => {
                const existing = registered.find(
                    (r) => r.nodeId === node.nodeId,
                );
                if (existing && !isSameComposerNodeDefinition(existing, node)) {
                    throw new ParameterError(
                        getComposerNodeConflictMessage(existing),
                    );
                }
            });
            byThread.set(threadUuid, [
                ...registered,
                ...nodes.filter(
                    (node) => !registered.some((r) => r.nodeId === node.nodeId),
                ),
            ]);
        },
    };
};

type ComposerNode = ToolComposerQueriesArgs['queries'][number];

// Test nodes carry no filters, so no explore is needed to resolve them.
const asSubmitted = (nodes: ComposerNode[]): SubmittedSourceQuery[] =>
    nodes.map((node) =>
        toolComposerQueryNodeToSourceQuery(
            resolveComposerQueryNode(node, {
                getExplore: () => {
                    throw new Error('unexpected explore lookup');
                },
            }),
        ),
    );

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

const successMetadata = (output: ComposerOutput) => {
    if (output.metadata.status !== 'success') {
        throw new Error(`Expected success, got ${output.metadata.status}`);
    }
    return output.metadata;
};

const makeTool = ({
    reviewQuery,
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    canRunSql = true,
    enablePythonNodes = false,
    enableDataAccess = true,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
    prompt = makePrompt(),
    agentContext = new AgentContext([mockOrdersExplore]),
    useSlackStreamCard = false,
    registry = makeNodeRegistry(),
    decisions,
    searchFieldValues,
}: {
    reviewQuery?: QueryReviewer;
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    canRunSql?: boolean;
    enablePythonNodes?: boolean;
    enableDataAccess?: boolean;
    waitForSqlApproval?: import('vitest').Mock;
    prompt?: AiWebAppPrompt | SlackPrompt;
    agentContext?: AgentContext;
    useSlackStreamCard?: boolean;
    registry?: ReturnType<typeof makeNodeRegistry>;
    decisions?: Pick<AiDecisionClient, 'evaluate'>;
    searchFieldValues?: SearchFieldValuesFn;
} = {}) => {
    const dependencies = {
        agentContext,
        reviewQuery,
        decisions,
        searchFieldValues,
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
        getPrompt: vi.fn().mockResolvedValue(prompt),
        updateSlackMessage: vi.fn().mockResolvedValue(undefined),
        siteUrl: 'https://lightdash.example',
        waitForSqlApproval,
        recordSqlApproval: vi.fn().mockResolvedValue(true),
        isThreadSqlAutoApproved: vi.fn().mockResolvedValue(false),
        listSqlApprovalDecisions: vi.fn().mockResolvedValue([]),
        trackSqlApprovalTimeout: vi.fn(),
        storeToolResults: vi.fn().mockResolvedValue(undefined),
        listThreadComposerQueryNodes: registry.listThreadComposerQueryNodes,
        registerThreadComposerQueryNodes:
            registry.registerThreadComposerQueryNodes,
        maxQueryLimit: 5000,
        enableDataAccess,
        canRunSql,
        enablePythonNodes,
        autoApproveSql,
        autoApproveSqlUserUuid,
        useSlackStreamCard,
    };

    return {
        tool: getRunComposerQueries(dependencies),
        dependencies,
        registry,
    };
};

describe('getRunComposerQueries', () => {
    it('in Slack, the reply can show the terminal result as a table that links to the thread, without an artifact', async () => {
        const agentContext = new AgentContext([]);
        const { tool, registry } = makeTool({
            autoApproveSql: true,
            prompt: makeSlackPrompt(),
            agentContext,
        });

        const output = await executeTool(tool, makeArgs(), 'composer-call');
        expect(output.result).not.toContain('<show');
        // The model selects the table using the queryUuid it was given.
        const queryUuid = output.result.match(/queryUuid="([^"]+)"/)?.[1];

        const previews = await getSlackTablePreviews({
            enableDataAccess: true,
            slackLinksOnly: false,
            selectedQueryUuids: queryUuid ? [queryUuid] : [],
            toolCalls: [
                {
                    tool_call_id: 'composer-call',
                    tool_name: 'runComposerQueries',
                    tool_args: makeArgs(),
                },
            ],
            toolResults: [
                {
                    toolCallId: 'composer-call',
                    toolType: 'built-in',
                    toolName: 'runComposerQueries',
                    metadata: output.metadata,
                },
            ],
            artifacts: [],
            threadNodes: registry.nodes('thread-uuid'),
            url: 'https://lightdash.test/threads/thread-uuid',
            runtimeResults: agentContext.getSlackTableResults(),
            authorize: vi.fn().mockResolvedValue(undefined),
            getResults: vi
                .fn()
                .mockRejectedValue(new Error('stored results not needed')),
            onLoadError: vi.fn(),
        });

        expect(previews).toEqual([
            expect.objectContaining({
                status: 'ready',
                title: 'Revenue vs signups',
                url: 'https://lightdash.test/threads/thread-uuid',
                queryResults: expect.objectContaining({
                    rows: [{ month: '2026-01', signups: 12 }],
                }),
            }),
        ]);
    });

    it('runs the pipeline and returns the terminal without presenting it', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
        });

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
        expect(successMetadata(output)).toEqual({
            status: 'success',
            queryUuid: 'query-3',
            terminalNodeId: 'joined',
            title: 'Revenue vs signups',
            description: null,
        });
        expect(output.result).toContain(
            'Not presented to the user yet. To present it, write <show node="joined"/> in your final answer, in this message or a later one.',
        );
        expect(output.result).toContain(
            [
                'Composer query complete. Terminal node "joined" returned 1 rows.',
                'Nodes in this pipeline:',
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
            toolName: 'query',
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
    });

    it('registers every node of a successful pipeline for later calls in the thread', async () => {
        const { tool, registry } = makeTool({ autoApproveSql: true });

        await executeTool(tool, makeArgs());

        expect(registry.nodes('thread-uuid').map((n) => n.nodeId)).toEqual([
            'revenue',
            'signups',
            'joined',
        ]);
    });

    it.each([
        ['rejected', 'rejected'],
        ['times out', 'timeout'],
    ] as const)(
        'registers nothing when the SQL approval is %s',
        async (_, outcome) => {
            const { tool, registry } = makeTool({
                waitForSqlApproval: vi.fn().mockResolvedValue(outcome),
            });

            const output = await executeTool(tool, makeArgs());

            expect(output.metadata?.status).toBe(outcome);
            expect(registry.nodes('thread-uuid')).toEqual([]);
        },
    );

    it('registers nothing when the run fails, so the node id can be resubmitted corrected', async () => {
        const { tool, dependencies, registry } = makeTool({
            autoApproveSql: true,
        });
        dependencies.runComposerQueries.mockRejectedValueOnce(
            new Error('Composer query failed on node(s): "joined"'),
        );

        const failed = await executeTool(tool, makeArgs(), 'tool-call-1');
        const corrected = await executeTool(
            tool,
            makeArgs({
                queries: [
                    semanticNode,
                    sqlNode,
                    { ...duckdbNode, sql: 'SELECT 1 AS fixed' },
                ],
            }),
            'tool-call-2',
        );

        expect(failed.metadata?.status).toBe('error');
        expect(corrected.metadata?.status).toBe('success');
        expect(
            registry
                .nodes('thread-uuid')
                .find((node) => node.nodeId === 'joined'),
        ).toEqual(expect.objectContaining({ sql: 'SELECT 1 AS fixed' }));
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
            toolName: 'query',
            promptedUserUuid: 'user-uuid',
            source: 'web',
        });
        expect(dependencies.recordSqlApproval).not.toHaveBeenCalled();
    });

    describe('native Slack approval', () => {
        const needsApproval = async (
            tool: ComposerTool,
            args: ToolComposerQueriesArgs,
        ) =>
            typeof tool.needsApproval === 'function'
                ? tool.needsApproval(args, {
                      toolCallId: 'tool-call-1',
                      messages: [],
                      context: {},
                  })
                : tool.needsApproval;

        it('suspends for approval only when the pipeline submits sql nodes', async () => {
            const { tool } = makeTool({
                prompt: makeSlackPrompt(),
                useSlackStreamCard: true,
            });

            expect(await needsApproval(tool, makeArgs())).toBe(true);
            expect(
                await needsApproval(
                    tool,
                    makeArgs({
                        queries: [
                            semanticNode,
                            { ...duckdbNode, references: ['revenue'] },
                        ],
                    }),
                ),
            ).toBe(false);
        });

        it('runs an approved resume without waiting and stores its result', async () => {
            const { tool, dependencies } = makeTool({
                prompt: makeSlackPrompt(),
                useSlackStreamCard: true,
            });

            const output = await executeTool(tool, makeArgs());

            expect(output.metadata?.status).toBe('success');
            expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
            expect(dependencies.storeToolResults).toHaveBeenCalledWith([
                expect.objectContaining({
                    toolCallId: 'tool-call-1',
                    toolName: 'query',
                    result: output.result,
                }),
            ]);
        });
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
            'query',
            'tool-call-1:revenue',
            'in_progress',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Query "revenue" complete',
            'query',
            'tool-call-1:revenue',
            'complete',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Query "joined" failed: column not found',
            'query',
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

const ordersNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by customer',
    exploreName: 'orders',
    dimensions: ['orders_customer_id'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const customersNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'customers',
    title: 'Customers',
    exploreName: 'customers',
    dimensions: ['customers_customer_id', 'customers_first_name'],
    metrics: [],
    limit: 500,
};

const enrichedNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'enriched',
    title: 'Orders with customer names',
    sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customers_customer_id',
    references: ['orders', 'customers'],
    limit: 500,
};

const rankedNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'ranked',
    title: 'Customers ranked by spend',
    sql: 'SELECT *, rank() OVER (ORDER BY orders_total_order_amount DESC) AS spend_rank FROM e',
    references: { e: 'enriched' },
    limit: 500,
};

const enrichedPipeline = [ordersNode, customersNode, enrichedNode];

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
    threadNodes,
    terminalNodeId = null,
}: {
    queries: ComposerNode[];
    threadNodes: ThreadComposerQueryNode[];
    terminalNodeId?: string | null;
}) => {
    const registry = makeNodeRegistry(threadNodes);
    const { tool, dependencies } = makeTool({ registry });
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

    const stored =
        output.metadata.status === 'success' ? output.metadata : undefined;
    const executed = dependencies.runComposerQueries.mock.calls[0]?.[0] as
        | { queries: SourceQuery[]; terminalNodeId: string }
        | undefined;
    return { output, stored, executed, dependencies, registry };
};

const nodeIdsOf = (queries: SourceQuery[] | undefined) =>
    queries?.map((node) => node.nodeId);

describe('composer artifact with reused nodes', () => {
    it('reads a node an earlier call in the thread registered', async () => {
        const { tool, dependencies } = makeTool({ autoApproveSql: true });
        await executeTool(tool, makeArgs(), 'tool-call-1');

        const output = await executeTool(
            tool,
            makeArgs({
                queries: [readerNode({ o: 'joined' })],
            }),
            'tool-call-2',
        );

        expect(output.metadata?.status).toBe('success');
        expect(
            nodeIdsOf(dependencies.runComposerQueries.mock.calls[1][0].queries),
        ).toEqual(['revenue', 'signups', 'joined', 'summary']);
    });

    it('registers reused nodes alongside the new ones', async () => {
        const { registry } = await runReuse({
            queries: [readerNode({ o: 'enriched' })],
            threadNodes: enrichedPipeline,
        });

        expect(registry.nodes('thread-uuid').map((n) => n.nodeId)).toEqual([
            'orders',
            'customers',
            'enriched',
            'summary',
        ]);
    });

    it('runs and stores a reused node and what it reads, without query ids', async () => {
        const { output, stored, executed, registry } = await runReuse({
            queries: [readerNode({ o: 'enriched' })],
            threadNodes: enrichedPipeline,
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
        expect(stored?.terminalNodeId).toBe('summary');
        expect(registry.nodes('thread-uuid')).toEqual(executed?.queries);
        expect(JSON.stringify(registry.nodes('thread-uuid'))).not.toContain(
            'run-query',
        );
        expect(output.result).toContain(
            [
                'Composer query complete. Terminal node "summary" returned 1 rows.',
                'Nodes in this pipeline:',
                '- orders: "Orders by customer" (semanticLayer)',
                '- customers: "Customers" (semanticLayer)',
                '- enriched: "Orders with customer names" (duckdb)',
                '- summary: "Spend summary" (duckdb)',
                'Terminal columns: total (number).',
            ].join('\n'),
        );
        expect(
            JSON.stringify({
                result: output.result,
                structuredContent: output.structuredContent,
            }),
        ).not.toContain('run-query');
    });

    it('copies a node reached directly and transitively once', async () => {
        const { executed } = await runReuse({
            queries: [readerNode({ o: 'orders', r: 'ranked' })],
            threadNodes: [...enrichedPipeline, rankedNode],
        });

        expect(nodeIdsOf(executed?.queries)).toEqual([
            'orders',
            'customers',
            'enriched',
            'ranked',
            'summary',
        ]);
    });

    it('can present a reused node named as the terminal node', async () => {
        const { stored } = await runReuse({
            queries: [readerNode({ o: 'enriched' })],
            threadNodes: enrichedPipeline,
            terminalNodeId: 'enriched',
        });

        expect(stored?.terminalNodeId).toBe('enriched');
    });

    it('accepts an unchanged earlier node resubmitted under its node id', async () => {
        const { output, executed } = await runReuse({
            queries: [resubmittedOrders(500), readerNode({ o: 'orders' })],
            threadNodes: enrichedPipeline,
        });

        expect(output.metadata?.status).toBe('success');
        expect(nodeIdsOf(executed?.queries)).toEqual(['orders', 'summary']);
    });

    it('refuses a node id redefined with a different definition', async () => {
        const { output, executed, stored } = await runReuse({
            queries: [resubmittedOrders(10), readerNode({ o: 'orders' })],
            threadNodes: enrichedPipeline,
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
            threadNodes: enrichedPipeline,
        });

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain(
            'Node "summary" reads "ordrs", which is not a node of this submission or of an earlier call in this thread. Nodes defined earlier in this thread: orders ("Orders by customer"), customers ("Customers"), enriched ("Orders with customer names").',
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
        const approvedSql: ThreadComposerQueryNode = {
            sourceType: QuerySourceType.SQL,
            nodeId: 'signups',
            title: 'Signups by month',
            sql: 'SELECT month, count(*) AS signups FROM raw.users GROUP BY 1',
            limit: 500,
        };
        const { output, executed, dependencies } = await runReuse({
            queries: [readerNode({ o: 'signups' })],
            threadNodes: [approvedSql],
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

describe('python composer nodes', () => {
    it('treats python references as edges when resolving the terminal node', () => {
        expect(
            resolveTerminalNodeId(
                asSubmitted([semanticNode, pythonNode]),
                null,
                [],
            ),
        ).toBe('forecast');
        expect(
            resolveTerminalNodeId(
                asSubmitted([
                    semanticNode,
                    pythonNode,
                    {
                        ...duckdbNode,
                        references: { f: 'forecast' },
                    },
                ]),
                null,
                [],
            ),
        ).toBe('joined');
        expect(() =>
            resolveTerminalNodeId(
                asSubmitted([semanticNode, { ...pythonNode, references: [] }]),
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

describe('semanticLayer node filters', () => {
    const ordersNodeWithFilters = (
        filters: ToolComposerSemanticLayerNode['filters'],
    ): ComposerNode => ({
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'revenue',
        title: 'Revenue by customer',
        description: null,
        exploreName: mockOrdersExplore.name,
        dimensions: ['orders_customer_name'],
        metrics: ['orders_total_revenue'],
        sorts: null,
        limit: 500,
        filters,
    });
    const submittedFilters = (dependencies: {
        runComposerQueries: import('vitest').Mock;
    }) => {
        const [{ queries }] = dependencies.runComposerQueries.mock.calls[0];
        const [node] = queries as SourceQuery[];
        if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
            throw new Error('expected the semanticLayer node first');
        }
        return node.filters;
    };

    it('resolves flat expressions against the explore into metric query filters', async () => {
        const { tool, dependencies } = makeTool();
        const output = await executeTool(
            tool,
            makeArgs({
                queries: [
                    ordersNodeWithFilters({
                        dimensions:
                            'orders_customer_name equals=Alice AND orders_amount greaterThan=100',
                        metrics: 'orders_total_revenue greaterThan=1000',
                    }),
                    sqlNode,
                    duckdbNode,
                ],
            }),
        );

        expect(output.metadata.status).toBe('success');
        expect(submittedFilters(dependencies)).toMatchObject({
            dimensions: {
                and: [
                    {
                        target: { fieldId: 'orders_customer_name' },
                        operator: FilterOperator.EQUALS,
                        values: ['Alice'],
                    },
                    {
                        target: { fieldId: 'orders_amount' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [100],
                    },
                ],
            },
            metrics: {
                and: [
                    {
                        target: { fieldId: 'orders_total_revenue' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [1000],
                    },
                ],
            },
        });
    });

    it('rejects an unknown field with suggestions before anything runs', async () => {
        const { tool, dependencies, registry } = makeTool();
        const output = await executeTool(
            tool,
            makeArgs({
                queries: [
                    ordersNodeWithFilters({
                        dimensions: 'orders_customer_nam equals=Alice',
                        metrics: null,
                    }),
                    sqlNode,
                    duckdbNode,
                ],
            }),
        );

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(
            'Invalid filters on semanticLayer node "revenue"',
        );
        expect(output.result).toContain('orders_customer_nam');
        expect(output.result).toContain('orders_customer_name');
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
        expect(registry.nodes('thread-uuid')).toEqual([]);
    });

    it('accepts an unchanged filtered node resubmitted in a later call', async () => {
        const expression = {
            dimensions: 'orders_customer_name equals=Alice',
            metrics: null,
        };
        const registry = makeNodeRegistry();
        const first = makeTool({ registry });
        const firstOutput = await executeTool(
            first.tool,
            makeArgs({ queries: [ordersNodeWithFilters(expression)] }),
        );
        expect(firstOutput.metadata.status).toBe('success');

        const second = makeTool({ registry });
        const secondOutput = await executeTool(
            second.tool,
            makeArgs({ queries: [ordersNodeWithFilters(expression)] }),
            'tool-call-2',
        );

        expect(secondOutput.metadata.status).toBe('success');
        expect(registry.nodes('thread-uuid')).toHaveLength(1);
    });

    describe('empty result filter value hints', () => {
        const EMPTY_DIAGNOSIS = 'Possible empty-result cause: filter value.';
        const filteredNode = ordersNodeWithFilters({
            dimensions: 'orders_customer_name equals=Alic',
            metrics: null,
        });
        const emptyTool = (
            searchFieldValues: SearchFieldValuesFn,
            queries: ComposerNode[] = [filteredNode],
        ) => {
            const reviewQuery = vi.fn<QueryReviewer>(async (_plan, result) =>
                result?.emptyResult
                    ? EMPTY_DIAGNOSIS
                    : ' Query/question review: check conditions.',
            );
            const made = makeTool({
                reviewQuery,
                decisions: {
                    evaluate: vi.fn().mockResolvedValue({
                        value: {
                            type: 'choice',
                            choice: '0',
                            confidence: 0.99,
                            probabilities: { '0': 1 },
                        },
                    }),
                },
                searchFieldValues,
            });
            made.dependencies.runComposerQueries.mockResolvedValue({
                submissions: [],
                terminal: {
                    queryUuid: 'empty',
                    columns: {},
                    rows: [],
                    rowCount: 0,
                },
            });
            return {
                ...made,
                run: () => executeTool(made.tool, makeArgs({ queries })),
            };
        };

        it('suggests a stored value equivalent to a filter literal that matched nothing, in place of the diagnosis', async () => {
            const searchFieldValues = vi.fn().mockResolvedValue(['Alice']);
            const output = await emptyTool(searchFieldValues).run();

            const hint = `${EMPTY_QUERY_GUIDANCE} For orders_customer_name, "Alice" is a likely equivalent of "Alic" from the available values. Verify it preserves the requested meaning before retrying. Query/question review: check conditions.`;
            expect(output.result).toContain(hint);
            expect(output.result).not.toContain(EMPTY_DIAGNOSIS);
            expect(output.structuredContent).toMatchObject({ review: hint });
            expect(searchFieldValues).toHaveBeenCalledWith({
                table: mockOrdersExplore.name,
                fieldId: 'orders_customer_name',
                query: 'Alic',
            });
        });

        it('keeps the diagnosis when the terminal node is not a semanticLayer node', async () => {
            const searchFieldValues = vi.fn().mockResolvedValue(['Alice']);
            const output = await emptyTool(searchFieldValues, [
                filteredNode,
                { ...duckdbNode, references: ['revenue'] },
            ]).run();

            expect(output.result).toContain(EMPTY_DIAGNOSIS);
            expect(searchFieldValues).not.toHaveBeenCalled();
        });

        it('keeps the diagnosis when the value lookup fails', async () => {
            const output = await emptyTool(
                vi.fn().mockRejectedValue(new Error('denied')),
            ).run();

            expect(output.metadata.status).toBe('success');
            expect(output.result).toContain(EMPTY_DIAGNOSIS);
        });

        it('stops waiting for a slow value lookup and keeps the diagnosis', async () => {
            vi.useFakeTimers();
            try {
                const pending = emptyTool(
                    vi.fn().mockReturnValue(new Promise(() => {})),
                ).run();
                await vi.advanceTimersByTimeAsync(1_000);
                const output = await pending;

                expect(output.metadata.status).toBe('success');
                expect(output.result).toContain(EMPTY_DIAGNOSIS);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    it('rejects a metric placed in the dimension expression', async () => {
        const { tool, dependencies } = makeTool();
        const output = await executeTool(
            tool,
            makeArgs({
                queries: [
                    ordersNodeWithFilters({
                        dimensions: 'orders_total_revenue greaterThan=100',
                        metrics: null,
                    }),
                    sqlNode,
                    duckdbNode,
                ],
            }),
        );

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('semanticLayer node "revenue"');
        expect(output.result).toContain('orders_total_revenue');
        expect(dependencies.runComposerQueries).not.toHaveBeenCalled();
    });
});
