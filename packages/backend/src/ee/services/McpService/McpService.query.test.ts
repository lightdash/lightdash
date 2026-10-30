import {
    DimensionType,
    FieldType,
    mcpQueryStructuredOutputSchema,
    MetricType,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    type SourceQuery,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import {
    composerSessionScope,
    type ComposerQueryNodeScope,
} from '../../database/entities/composerQueryNodes';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type ToolResult = {
    isError?: boolean;
    content: { type: 'text'; text: string }[];
    structuredContent?: Record<string, unknown>;
};
type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<ToolResult>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                server: {
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
                },
                registerResource: vi.fn(),
                registerPrompt: vi.fn(),
                registerTool: vi.fn(
                    (
                        name: string,
                        _config: unknown,
                        callback: RegisteredToolCallback,
                    ) => {
                        mockRegisteredMcpTools.set(name, callback);
                        return {};
                    },
                ),
            };
        },
    ),
}));

const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';
const projectUuid = 'project-uuid';
const agentUuid = '22222222-2222-4222-8222-222222222222';

const makeExplore = (name: string, tags: string[]) => ({
    name,
    label: name,
    tags,
    baseTable: name,
    joinedTables: [],
    tables: {
        [name]: {
            name,
            label: name,
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    name: 'status',
                    label: 'Status',
                    table: name,
                    type: DimensionType.STRING,
                },
            },
            metrics: {
                count: {
                    fieldType: FieldType.METRIC,
                    name: 'count',
                    label: 'Count',
                    table: name,
                    tablesReferences: [name],
                    type: MetricType.COUNT,
                },
            },
        },
    },
});

const explores = [
    makeExplore('orders', ['sales']),
    makeExplore('payments', ['finance']),
];

const nodeQueryUuids: Record<string, string> = {
    orders: '00000000-0000-4000-8000-000000000001',
    totals: '00000000-0000-4000-8000-000000000002',
    raw: '00000000-0000-4000-8000-000000000003',
};
const queryUuidFor = (nodeId: string) => nodeQueryUuids[nodeId];

type SessionOwner = {
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
};

// In-memory stand-in for the session and node tables; ownership and expiry
// rules are covered by the model integration tests.
const makeComposerSessionStore = () => {
    const sessions = new Map<string, SessionOwner & { expired: boolean }>();
    const nodesByScope = new Map<string, ThreadComposerQueryNode[]>();
    const scopeKey = ({ scopeType, scopeUuid }: ComposerQueryNodeScope) =>
        `${scopeType}:${scopeUuid}`;
    return {
        sessions,
        expire: (sessionUuid: string) => {
            const session = sessions.get(sessionUuid);
            if (session) session.expired = true;
        },
        model: {
            createComposerSession: async (owner: SessionOwner) => {
                const sessionUuid = uuidv4();
                sessions.set(sessionUuid, { ...owner, expired: false });
                return sessionUuid;
            },
            useComposerSession: async ({
                sessionUuid,
                ...owner
            }: SessionOwner & { sessionUuid: string }) => {
                const session = sessions.get(sessionUuid);
                return (
                    !!session &&
                    !session.expired &&
                    session.userUuid === owner.userUuid &&
                    session.organizationUuid === owner.organizationUuid &&
                    session.projectUuid === owner.projectUuid
                );
            },
            listComposerQueryNodes: async (scope: ComposerQueryNodeScope) =>
                nodesByScope.get(scopeKey(scope)) ?? [],
            registerComposerQueryNodes: async ({
                scope,
                nodes,
            }: {
                scope: ComposerQueryNodeScope;
                nodes: ThreadComposerQueryNode[];
            }) => {
                const registered = nodesByScope.get(scopeKey(scope)) ?? [];
                nodesByScope.set(scopeKey(scope), [
                    ...registered,
                    ...nodes.filter(
                        (node) =>
                            !registered.some(
                                ({ nodeId }) => nodeId === node.nodeId,
                            ),
                    ),
                ]);
            },
        },
    };
};

type Agent = {
    uuid: string;
    name: string;
    tags: string[] | null;
    spaceAccess: string[];
    enableDataAccess: boolean;
    enableComposerQueries: boolean;
};

const nodeColumns: Record<
    string,
    Record<string, { reference: string; type: DimensionType }>
> = {
    orders: {
        orders_status: {
            reference: 'orders_status',
            type: DimensionType.STRING,
        },
        orders_count: { reference: 'orders_count', type: DimensionType.NUMBER },
    },
    totals: {
        orders_status: {
            reference: 'orders_status',
            type: DimensionType.STRING,
        },
        total: { reference: 'total', type: DimensionType.NUMBER },
    },
};
// orders returns its full limit of 500 rows; totals aggregates them to 2.
const nodeRowCounts: Record<string, number> = { orders: 500, totals: 2 };

const makeService = ({
    agent = null,
    composeSqlRunnerEnabled = true,
    canManageSqlRunner = true,
    terminalOutcome = 'success',
}: {
    agent?: Agent | null;
    composeSqlRunnerEnabled?: boolean;
    canManageSqlRunner?: boolean;
    terminalOutcome?: 'success' | 'running' | 'failure';
} = {}) => {
    const runComposerQueriesUntilDeadline = vi.fn(
        async ({
            queries,
            terminalNodeId,
        }: {
            queries: SourceQuery[];
            terminalNodeId: string;
        }) => {
            const submissions = queries.map((query) => ({
                nodeId: query.nodeId!,
                sourceType: query.sourceType,
                queryUuid: queryUuidFor(query.nodeId!),
            }));
            // Upstream nodes are ready; the terminal settles per terminalOutcome.
            const nodeStatuses = queries.map(({ nodeId }) => {
                const ready = {
                    nodeId: nodeId!,
                    state: QueryHistoryStatus.READY,
                    error: null,
                    rowCount: nodeRowCounts[nodeId!] ?? 1,
                    columns: nodeColumns[nodeId!] ?? null,
                };
                if (nodeId !== terminalNodeId || terminalOutcome === 'success')
                    return ready;
                return {
                    ...ready,
                    state:
                        terminalOutcome === 'running'
                            ? QueryHistoryStatus.EXECUTING
                            : QueryHistoryStatus.ERROR,
                    error:
                        terminalOutcome === 'failure'
                            ? 'Binder Error: column "nope" not found'
                            : null,
                    rowCount: null,
                    columns: null,
                };
            });
            if (terminalOutcome === 'running')
                return { status: 'running', submissions, nodeStatuses };
            if (terminalOutcome === 'failure')
                return {
                    status: 'failure',
                    error: 'Composer query failed.',
                    nodeStatuses,
                };
            return {
                status: 'success',
                submissions,
                terminal: {
                    queryUuid: queryUuidFor(terminalNodeId),
                    columns: nodeColumns[terminalNodeId] ?? nodeColumns.totals,
                    rows: [
                        { orders_status: 'completed', total: 3 },
                        { orders_status: 'placed', total: 1 },
                    ],
                    rowCount: 2,
                },
                nodeStatuses,
            };
        },
    );
    const asyncQueryService = {
        getAsyncQueryHistory: vi.fn(),
        getAsyncQueryResults: vi.fn(),
        pollQueryHistoryUntilDeadline: vi.fn(),
    };
    const composerSessions = makeComposerSessionStore();
    const deniedSubjects = new Set(canManageSqlRunner ? [] : ['SqlRunner']);
    const ability = {
        relevantRuleFor: vi.fn((_action: string, subject: unknown) => ({
            inverted: deniedSubjects.has(
                typeof subject === 'string'
                    ? subject
                    : (subject as { __caslSubjectType__: string })
                          .__caslSubjectType__,
            ),
        })),
        rules: [],
    };
    const user = { userUuid, organizationUuid, ability };
    const service = new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiAgentModel: composerSessions.model,
        aiAgentToolsService: {
            listMcpSkillResources: () => [],
            createRuntime: ({ tags }: { tags: string[] | null }) => {
                const scoped = explores.filter(
                    (explore) =>
                        !tags || explore.tags.some((tag) => tags.includes(tag)),
                );
                return {
                    getExplore: async ({ table }: { table: string }) => {
                        const explore = scoped.find(
                            ({ name }) => name === table,
                        );
                        return explore
                            ? { status: 'success', data: explore }
                            : {
                                  status: 'error',
                                  error: new NotFoundError(
                                      `Explore "${table}" not found`,
                                  ),
                              };
                    },
                    getProjectParameterDefinitions: async () => ({}),
                    runComposerQueriesUntilDeadline,
                };
            },
        },
        aiAgentService: {
            getAgent: vi.fn(async () => {
                if (!agent) throw new Error('Agent not mocked');
                return { ...agent, projectUuid };
            }),
        },
        aiOrganizationSettingsService: {
            isMcpAgentsEnabled: vi.fn().mockResolvedValue(true),
        },
        analytics: { track: vi.fn() },
        asyncQueryService,
        featureFlagService: {
            get: vi.fn(async () => ({ enabled: composeSqlRunnerEnabled })),
        },
        lightdashConfig: {
            ai: { copilot: { maxQueryLimit: 5000 } },
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: { getContext: vi.fn().mockResolvedValue(undefined) },
        mcpToolCallModel: {
            createToolCall: vi.fn(),
            findClientInfo: vi.fn(),
        },
        projectService: {
            getProject: vi.fn().mockResolvedValue({ organizationUuid }),
        },
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    const extraFor = (callerUuid: string) => ({
        signal: new AbortController().signal,
        requestId: 'request-id',
        sendNotification: vi.fn(),
        sendRequest: vi.fn(),
        authInfo: {
            extra: {
                user: { ...user, userUuid: callerUuid },
                account: {
                    isRegisteredUser: () => true,
                    isServiceAccount: () => false,
                    authentication: { type: 'pat' },
                    user: { id: callerUuid },
                    organization: { organizationUuid },
                },
            },
        },
    });
    const callAs = async (
        callerUuid: string,
        tool: string,
        args: Record<string, unknown>,
    ) => {
        const callback = mockRegisteredMcpTools.get(tool);
        if (!callback) throw new Error(`${tool} not registered`);
        return callback({ projectUuid, ...args }, extraFor(callerUuid));
    };
    const call = (tool: string, args: Record<string, unknown>) =>
        callAs(userUuid, tool, args);
    return {
        service,
        user,
        deniedSubjects,
        call,
        callAs,
        composerSessions,
        asyncQueryService,
        runComposerQueriesUntilDeadline,
    };
};

const createServer = async (service: McpService, queryEnabled = true) => {
    mockRegisteredMcpTools.clear();
    await service.createServer(makeMcpServerOptions({ queryEnabled }));
};

const ordersNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by status',
    description: 'Counts orders per status.',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: null,
    sorts: [],
    limit: 500,
    parameters: null,
};

const totalsNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'totals',
    title: 'Totals',
    description: 'Renames the count.',
    sql: 'SELECT orders_status, orders_count AS total FROM orders',
    references: ['orders'],
    limit: 500,
};

const pipelineArgs = (queries: unknown[]) => ({
    title: null,
    description: null,
    queries,
    terminalNodeId: null,
});

const textOf = (result: ToolResult) =>
    result.content.map(({ text }) => text).join('\n');

describe('McpService query tool', () => {
    it('is listed only where composer queries can run', async () => {
        const { service } = makeService();
        await createServer(service, true);
        expect(mockRegisteredMcpTools.has(McpToolName.QUERY)).toBe(true);
        await createServer(service, false);
        expect(mockRegisteredMcpTools.has(McpToolName.QUERY)).toBe(false);
    });

    it('is enabled by the compose SQL runner flag, manage:Explore and the pinned agent', async () => {
        const enabledAgent = {
            enableDataAccess: true,
            enableComposerQueries: true,
        };
        const { service, user } = makeService();
        const asSessionUser = user as unknown as Parameters<
            McpService['isQueryEnabled']
        >[0];
        await expect(
            service.isQueryEnabled(asSessionUser, projectUuid, enabledAgent),
        ).resolves.toBe(true);
        await expect(
            service.isQueryEnabled(asSessionUser, projectUuid, {
                ...enabledAgent,
                enableComposerQueries: false,
            }),
        ).resolves.toBe(false);
        await expect(
            service.isQueryEnabled(asSessionUser, projectUuid, {
                ...enabledAgent,
                enableDataAccess: false,
            }),
        ).resolves.toBe(false);

        const flagOff = makeService({ composeSqlRunnerEnabled: false });
        await expect(
            flagOff.service.isQueryEnabled(
                flagOff.user as unknown as typeof asSessionUser,
                projectUuid,
                null,
            ),
        ).resolves.toBe(false);

        const noExplore = makeService();
        noExplore.deniedSubjects.add('Explore');
        await expect(
            noExplore.service.isQueryEnabled(
                noExplore.user as unknown as typeof asSessionUser,
                projectUuid,
                null,
            ),
        ).resolves.toBe(false);
    });

    it("returns the terminal node's preview and every node's query uuid", async () => {
        const { service, call } = makeService();
        await createServer(service);

        const result = await call(
            McpToolName.QUERY,
            pipelineArgs([ordersNode, totalsNode]),
        );

        expect(result.isError).toBeUndefined();
        expect(
            mcpQueryStructuredOutputSchema.parse(result.structuredContent),
        ).toEqual({
            sessionId: expect.any(String),
            status: 'done',
            terminalNodeId: 'totals',
            rowCount: 2,
            nodes: [
                {
                    nodeId: 'orders',
                    title: 'Orders by status',
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    queryUuid: queryUuidFor('orders'),
                    status: 'done',
                    rowCount: 500,
                    limit: 500,
                    reachedLimit: true,
                    columns: [
                        {
                            reference: 'orders_status',
                            type: DimensionType.STRING,
                        },
                        {
                            reference: 'orders_count',
                            type: DimensionType.NUMBER,
                        },
                    ],
                },
                {
                    nodeId: 'totals',
                    title: 'Totals',
                    sourceType: QuerySourceType.DUCKDB,
                    queryUuid: queryUuidFor('totals'),
                    status: 'done',
                    rowCount: 2,
                    limit: 500,
                    reachedLimit: false,
                    columns: [
                        {
                            reference: 'orders_status',
                            type: DimensionType.STRING,
                        },
                        { reference: 'total', type: DimensionType.NUMBER },
                    ],
                },
            ],
        });
        expect(textOf(result)).toContain(
            'Warning: "totals" reads "orders", which reached its limit',
        );
        expect(textOf(result)).toContain(
            'orders_status,total\ncompleted,3\nplaced,1',
        );
    });

    it('rejects a read of a node outside the submission', async () => {
        const { service, call, runComposerQueriesUntilDeadline } =
            makeService();
        await createServer(service);

        const result = await call(
            McpToolName.QUERY,
            pipelineArgs([{ ...totalsNode, references: ['missing'] }]),
        );

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('missing');
        expect(runComposerQueriesUntilDeadline).not.toHaveBeenCalled();
    });

    it('rejects a semantic-layer node outside the agent scope', async () => {
        const { service, call, runComposerQueriesUntilDeadline } = makeService({
            agent: {
                uuid: agentUuid,
                name: 'Finance agent',
                tags: ['finance'],
                spaceAccess: [],
                enableDataAccess: true,
                enableComposerQueries: true,
            },
        });
        await createServer(service);

        const result = await call(McpToolName.QUERY, {
            ...pipelineArgs([ordersNode]),
            agentUuid,
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('orders');
        expect(runComposerQueriesUntilDeadline).not.toHaveBeenCalled();
    });

    it('refuses a call through an agent with composer queries off', async () => {
        const { service, call, runComposerQueriesUntilDeadline } = makeService({
            agent: {
                uuid: agentUuid,
                name: 'Sales agent',
                tags: null,
                spaceAccess: [],
                enableDataAccess: true,
                enableComposerQueries: false,
            },
        });
        await createServer(service);

        const result = await call(McpToolName.QUERY, {
            ...pipelineArgs([ordersNode]),
            agentUuid,
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('Composer queries are not enabled');
        expect(runComposerQueriesUntilDeadline).not.toHaveBeenCalled();
    });

    it('refuses sql nodes where run_sql is not allowed', async () => {
        const { service, call, runComposerQueriesUntilDeadline } = makeService({
            canManageSqlRunner: false,
        });
        await createServer(service);

        const result = await call(
            McpToolName.QUERY,
            pipelineArgs([
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'raw',
                    title: 'Raw orders',
                    description: 'Reads orders.',
                    sql: 'SELECT * FROM orders',
                    limit: 500,
                },
            ]),
        );

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('"sql" nodes');
        expect(runComposerQueriesUntilDeadline).not.toHaveBeenCalled();
    });

    it('returns running past the deadline, then get_query_result reads a node result', async () => {
        const { service, call, asyncQueryService } = makeService({
            terminalOutcome: 'running',
        });
        await createServer(service);

        const running = await call(
            McpToolName.QUERY,
            pipelineArgs([ordersNode, totalsNode]),
        );

        expect(running.isError).toBeUndefined();
        expect(running.structuredContent).toMatchObject({
            status: 'running',
            terminalNodeId: 'totals',
            rowCount: null,
            nodes: [
                { nodeId: 'orders', status: 'done', rowCount: 500 },
                {
                    nodeId: 'totals',
                    status: 'running',
                    rowCount: null,
                    columns: null,
                },
            ],
        });
        expect(textOf(running)).toContain(
            `get_query_result with queryUuid: ${queryUuidFor('totals')}`,
        );

        asyncQueryService.getAsyncQueryHistory.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            context: QueryExecutionContext.MCP_QUERY,
            metricQuery: null,
            requestParameters: null,
        });
        asyncQueryService.getAsyncQueryResults.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [
                {
                    total: { value: { raw: 4, formatted: '4' } },
                },
            ],
            columns: {
                total: { reference: 'total', type: DimensionType.NUMBER },
            },
        });

        const result = await call(McpToolName.GET_QUERY_RESULT, {
            queryUuid: queryUuidFor('totals'),
        });

        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toMatchObject({
            result: {
                status: 'done',
                queryUuid: queryUuidFor('totals'),
                rows: [{ total: 4 }],
            },
        });
    });

    it('reports the failed node and the nodes that ran', async () => {
        const { service, call } = makeService({ terminalOutcome: 'failure' });
        await createServer(service);

        const result = await call(
            McpToolName.QUERY,
            pipelineArgs([ordersNode, totalsNode]),
        );

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('- orders: "Orders by status"');
        expect(textOf(result)).toContain(
            '- totals: "Totals" (duckdb): error: Binder Error: column "nope" not found',
        );
    });

    describe('composer sessions', () => {
        const topNode = {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'top',
            title: 'Top status',
            description: 'Keeps the largest status.',
            sql: 'SELECT * FROM totals ORDER BY total DESC LIMIT 1',
            references: ['totals'],
            limit: 1,
        };

        const startSession = async (
            call: (
                tool: string,
                args: Record<string, unknown>,
            ) => Promise<ToolResult>,
        ) => {
            const first = await call(
                McpToolName.QUERY,
                pipelineArgs([ordersNode, totalsNode]),
            );
            expect(first.isError).toBeUndefined();
            return first.structuredContent?.sessionId as string;
        };

        it('returns a new session id from a call without one', async () => {
            const { service, call, composerSessions } = makeService();
            await createServer(service);

            const result = await call(
                McpToolName.QUERY,
                pipelineArgs([ordersNode, totalsNode]),
            );

            const { sessionId } = mcpQueryStructuredOutputSchema.parse(
                result.structuredContent,
            );
            expect(composerSessions.sessions.has(sessionId!)).toBe(true);
            expect(textOf(result)).toContain(`sessionId: ${sessionId}`);
        });

        it('starts no session when the pipeline is rejected', async () => {
            const { service, call, composerSessions } = makeService();
            await createServer(service);

            const result = await call(
                McpToolName.QUERY,
                pipelineArgs([{ ...totalsNode, references: ['missing'] }]),
            );

            expect(result.isError).toBe(true);
            expect(composerSessions.sessions.size).toBe(0);
        });

        it('reads a node of an earlier call in the session by its node id', async () => {
            const { service, call, runComposerQueriesUntilDeadline } =
                makeService();
            await createServer(service);
            const sessionId = await startSession(call);

            const result = await call(McpToolName.QUERY, {
                ...pipelineArgs([topNode]),
                sessionId,
            });

            expect(result.isError).toBeUndefined();
            expect(result.structuredContent).toMatchObject({
                sessionId,
                terminalNodeId: 'top',
            });
            expect(
                runComposerQueriesUntilDeadline.mock.lastCall?.[0].queries.map(
                    ({ nodeId }) => nodeId,
                ),
            ).toEqual(['orders', 'totals', 'top']);
        });

        it('keeps the ready nodes of a failed call in the session', async () => {
            const { service, call, composerSessions } = makeService({
                terminalOutcome: 'failure',
            });
            await createServer(service);

            const result = await call(
                McpToolName.QUERY,
                pipelineArgs([ordersNode, totalsNode]),
            );

            expect(result.isError).toBe(true);
            const [sessionId] = [...composerSessions.sessions.keys()];
            expect(textOf(result)).toContain(
                'Saved from this call: orders. Not saved: totals (failed: Binder Error: column "nope" not found).',
            );
            expect(textOf(result)).toContain(`sessionId: ${sessionId}`);
            expect(
                (
                    await composerSessions.model.listComposerQueryNodes(
                        composerSessionScope(sessionId),
                    )
                ).map(({ nodeId }) => nodeId),
            ).toEqual(['orders']);
        });

        it('saves only the ready nodes of a call still running at the deadline', async () => {
            const { service, call, composerSessions } = makeService({
                terminalOutcome: 'running',
            });
            await createServer(service);

            const result = await call(
                McpToolName.QUERY,
                pipelineArgs([ordersNode, totalsNode]),
            );

            const { sessionId } = mcpQueryStructuredOutputSchema.parse(
                result.structuredContent,
            );
            expect(sessionId).not.toBeNull();
            expect(textOf(result)).toContain(
                'Saved from this call: orders. Not saved: totals (not finished: executing).',
            );
            expect(
                (
                    await composerSessions.model.listComposerQueryNodes(
                        composerSessionScope(sessionId!),
                    )
                ).map(({ nodeId }) => nodeId),
            ).toEqual(['orders']);
        });

        it.each(['running', 'failure'] as const)(
            'starts no session when a %s call saves no node',
            async (terminalOutcome) => {
                const { service, call, composerSessions } = makeService({
                    terminalOutcome,
                });
                await createServer(service);

                const result = await call(
                    McpToolName.QUERY,
                    pipelineArgs([ordersNode]),
                );

                expect(composerSessions.sessions.size).toBe(0);
                expect(textOf(result)).toContain(
                    'No sessionId: no node was saved.',
                );
                if (terminalOutcome === 'running') {
                    expect(result.structuredContent).toMatchObject({
                        sessionId: null,
                    });
                }
            },
        );

        it('keeps the given session when a call saves no node', async () => {
            const {
                service,
                call,
                composerSessions,
                runComposerQueriesUntilDeadline,
            } = makeService();
            await createServer(service);
            const sessionId = await startSession(call);
            runComposerQueriesUntilDeadline.mockResolvedValueOnce({
                status: 'running',
                submissions: [
                    {
                        nodeId: 'orders',
                        sourceType: QuerySourceType.SEMANTIC_LAYER,
                        queryUuid: queryUuidFor('orders'),
                    },
                ],
                nodeStatuses: [],
            });

            const result = await call(McpToolName.QUERY, {
                ...pipelineArgs([ordersNode]),
                sessionId,
            });

            expect(result.structuredContent).toMatchObject({
                status: 'running',
                sessionId,
            });
            expect(composerSessions.sessions.size).toBe(1);
        });

        it('lists the readable nodes of the session when a node reads an unknown node id', async () => {
            const { service, call } = makeService();
            await createServer(service);
            const sessionId = await startSession(call);

            const result = await call(McpToolName.QUERY, {
                ...pipelineArgs([{ ...topNode, references: ['missing'] }]),
                sessionId,
            });

            expect(result.isError).toBe(true);
            expect(textOf(result)).toContain(
                'Node "top" reads "missing", which is not a node of this submission or of an earlier call in this session. Nodes defined earlier in this session: orders ("Orders by status"), totals ("Totals").',
            );
        });

        it('rejects a different definition under a node id of the session', async () => {
            const { service, call } = makeService();
            await createServer(service);
            const sessionId = await startSession(call);

            const result = await call(McpToolName.QUERY, {
                ...pipelineArgs([{ ...ordersNode, limit: 10 }]),
                sessionId,
            });

            expect(result.isError).toBe(true);
            expect(textOf(result)).toContain(
                'Node id "orders" already names a different node in this session ("Orders by status").',
            );
        });

        it.each([
            ['another user', { caller: 'other-user-uuid' }],
            [
                'another project',
                { projectUuid: '33333333-3333-4333-8333-333333333333' },
            ],
            ['an expired session', { expire: true }],
            ['an unknown session', { sessionId: uuidv4() }],
        ])(
            'rejects the session id of %s without starting a new one',
            async (_case, overrides) => {
                const {
                    service,
                    call,
                    callAs,
                    composerSessions,
                    runComposerQueriesUntilDeadline,
                } = makeService();
                await createServer(service);
                const sessionId = await startSession(call);
                if ('expire' in overrides) composerSessions.expire(sessionId);
                runComposerQueriesUntilDeadline.mockClear();

                const result = await callAs(
                    'caller' in overrides ? overrides.caller : userUuid,
                    McpToolName.QUERY,
                    {
                        ...pipelineArgs([topNode]),
                        sessionId:
                            'sessionId' in overrides
                                ? overrides.sessionId
                                : sessionId,
                        ...('projectUuid' in overrides
                            ? { projectUuid: overrides.projectUuid }
                            : {}),
                    },
                );

                expect(result.isError).toBe(true);
                expect(textOf(result)).toContain('omit sessionId');
                expect(composerSessions.sessions.size).toBe(1);
                expect(runComposerQueriesUntilDeadline).not.toHaveBeenCalled();
            },
        );
    });
});
