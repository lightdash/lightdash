import {
    QuerySourceType,
    type AiWebAppPrompt,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';
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
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Join revenue with signups',
    createdAt: new Date('2026-05-19T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
});

type ComposerNode = ToolComposerQueriesArgs['queries'][number];

const semanticNode: ComposerNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'revenue',
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
    sql: 'SELECT month, count(*) AS signups FROM raw.users GROUP BY 1',
    limit: 500,
};

const duckdbNode: ComposerNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'joined',
    sql: 'SELECT * FROM revenue JOIN signups USING (month)',
    references: ['revenue', 'signups'],
    limit: 500,
};

const externalNode: ComposerNode = {
    sourceType: QuerySourceType.EXTERNAL,
    nodeId: 'targets',
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
    }) as Promise<ComposerOutput>;

const makeTool = ({
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    canRunSql = true,
    enableDataAccess = true,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
}: {
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    canRunSql?: boolean;
    enableDataAccess?: boolean;
    waitForSqlApproval?: import('vitest').Mock;
} = {}) => {
    const dependencies = {
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
                    terminalNodeId: 'joined',
                    lastQueryUuid: 'query-3',
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
                    tables: {
                        targets: '2b7cd26e-1b5a-4aaf-9955-e25c381c501f',
                    },
                },
            ],
            terminalNodeId: 'targets',
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
                { ...semanticNode, filters: undefined, sorts: undefined },
                externalNode,
                composedNode,
            ],
            terminalNodeId: 'joined',
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
