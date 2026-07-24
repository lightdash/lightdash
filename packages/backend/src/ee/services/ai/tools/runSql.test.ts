import { type AiWebAppPrompt, type SlackPrompt } from '@lightdash/common';
import { getRunSql } from './runSql';

type RunSqlTool = ReturnType<typeof getRunSql>;
type RunSqlOutput = {
    result: string;
    metadata?: { status: string };
};
type MakeToolOptions = {
    autoApproveSql?: boolean;
    autoApproveSqlUserUuid?: string | null;
    waitForSqlApproval?: import('vitest').Mock;
    recordSqlApproval?: import('vitest').Mock;
    maxQueryLimit?: number;
};

const executeRunSql = (tool: RunSqlTool, toolCallId: string = 'tool-call-1') =>
    tool.execute!(
        {
            sql: 'select 1 as answer',
            limit: 500,
        },
        {
            messages: [],
            toolCallId,
        },
    ) as Promise<RunSqlOutput>;

const makePrompt = (): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'How many users do we have?',
    createdAt: new Date('2026-05-19T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
});

const makeSlackPrompt = (): SlackPrompt => ({
    ...makePrompt(),
    response_slack_ts: 'response-ts',
    slackUserId: 'slack-user',
    slackChannelId: 'slack-channel',
    promptSlackTs: 'prompt-ts',
    slackThreadTs: 'thread-ts',
});

const makeTool = ({
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
    recordSqlApproval = vi.fn().mockResolvedValue(true),
    maxQueryLimit = 5000,
    useSlackStreamCard = false,
    prompt = makePrompt(),
}: MakeToolOptions & {
    useSlackStreamCard?: boolean;
    prompt?: AiWebAppPrompt | SlackPrompt;
} = {}) => {
    const dependencies = {
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runSqlJob: vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
            rows: [{ answer: 1 }],
            columns: ['answer'],
            rowCount: 1,
        }),
        getPrompt: vi.fn().mockResolvedValue(prompt),
        sendFile: vi.fn().mockResolvedValue(undefined),
        updateSlackMessage: vi.fn().mockResolvedValue(undefined),
        siteUrl: 'https://lightdash.example',
        waitForSqlApproval,
        recordSqlApproval,
        isThreadSqlAutoApproved: vi.fn().mockResolvedValue(false),
        storeToolResults: vi.fn().mockResolvedValue(undefined),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        autoApproveSql,
        autoApproveSqlUserUuid,
        maxQueryLimit,
        useSlackStreamCard,
    };

    return {
        tool: getRunSql(dependencies),
        dependencies,
    };
};

describe('getRunSql', () => {
    it('auto-approves SQL without waiting for human approval', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
            autoApproveSqlUserUuid: 'user-uuid',
        });

        const output = await executeRunSql(tool);

        expect(dependencies.recordSqlApproval).toHaveBeenCalledWith(
            'tool-call-1',
            'approved',
            'user-uuid',
        );
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.runSqlJob).toHaveBeenCalledWith({
            sql: 'select 1 as answer',
            limit: 500,
        });
        expect(dependencies.updateProgress).not.toHaveBeenCalledWith(
            'Awaiting approval to run SQL...',
        );
        expect(output.metadata?.status).toBe('success');
    });

    it('waits for approval by default', async () => {
        const { tool, dependencies } = makeTool();

        const output = await executeRunSql(tool);

        expect(dependencies.recordSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.waitForSqlApproval).toHaveBeenCalledWith(
            'tool-call-1',
        );
        expect(dependencies.updateProgress).toHaveBeenCalledWith(
            'Awaiting approval to run SQL...',
        );
        expect(output.metadata?.status).toBe('success');
    });

    it('creates a SQL-backed chart artifact for web results', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
        });

        await executeRunSql(tool);

        expect(dependencies.createOrUpdateArtifact).toHaveBeenCalledWith({
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
            artifactType: 'chart',
            title: 'SQL query results',
            vizConfig: {
                source: 'sql',
                sql: 'select 1 as answer',
                limit: 500,
            },
        });
    });

    it('creates an artifact even when the SQL result has no rows', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
        });
        dependencies.runSqlJob.mockResolvedValueOnce({
            queryUuid: 'empty-query-uuid',
            rows: [],
            columns: ['answer'],
            rowCount: 0,
        });

        const output = await executeRunSql(tool);

        expect(output.metadata?.status).toBe('success');
        expect(dependencies.createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: {
                    source: 'sql',
                    sql: 'select 1 as answer',
                    limit: 500,
                },
            }),
        );
    });

    it('does not create a web artifact for Slack results', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
            prompt: makeSlackPrompt(),
        });

        await executeRunSql(tool);

        expect(dependencies.createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it('clamps a requested limit above maxQueryLimit when calling runSqlJob', async () => {
        const { tool, dependencies } = makeTool({
            autoApproveSql: true,
            autoApproveSqlUserUuid: 'user-uuid',
            maxQueryLimit: 2000,
        });

        await tool.execute!(
            {
                sql: 'select 1 as answer',
                limit: 5000,
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
            },
        );

        expect(dependencies.runSqlJob).toHaveBeenCalledWith({
            sql: 'select 1 as answer',
            limit: 2000,
        });
    });

    it('does not open another approval wait after approval times out', async () => {
        const waitForSqlApproval = vi.fn().mockResolvedValue('timeout');
        const { tool, dependencies } = makeTool({ waitForSqlApproval });

        const firstOutput = await executeRunSql(tool, 'tool-call-1');
        const secondOutput = await executeRunSql(tool, 'tool-call-2');

        expect(firstOutput.metadata?.status).toBe('timeout');
        expect(secondOutput.metadata?.status).toBe('timeout');
        expect(secondOutput.result).toContain(
            'Do not call runSql again in this response',
        );
        expect(dependencies.waitForSqlApproval).toHaveBeenCalledTimes(1);
        expect(dependencies.waitForSqlApproval).toHaveBeenCalledWith(
            'tool-call-1',
        );
        expect(dependencies.runSqlJob).not.toHaveBeenCalled();
    });

    it('rejects nested SQL execution functions before approval', async () => {
        const { tool, dependencies } = makeTool();

        const output = (await tool.execute!(
            {
                sql: "SELECT * FROM query('INSTALL shellfs')",
                limit: 500,
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
            },
        )) as RunSqlOutput;

        expect(output.metadata?.status).toBe('error');
        expect(output.result).toContain('forbidden functions');
        expect(dependencies.waitForSqlApproval).not.toHaveBeenCalled();
        expect(dependencies.runSqlJob).not.toHaveBeenCalled();
    });

    // On the native-approval (modern Slack) path, execute only runs as a resume
    // of a previously-approved call, so it must persist its own result — even
    // when the SQL is blocked/rejected. Otherwise the tool_use is left with no
    // tool_result and the resumed request 400s. (ZAP-601)
    describe('native-approval resume persists a result for every outcome', () => {
        const runNativeResume = (sql: string, toolCallId = 'tool-call-1') => {
            const { tool, dependencies } = makeTool({
                useSlackStreamCard: true,
                prompt: makeSlackPrompt(),
            });
            return {
                dependencies,
                output: tool.execute!(
                    { sql, limit: 500 },
                    { messages: [], toolCallId },
                ) as Promise<RunSqlOutput>,
            };
        };

        it('persists an error result for a guardrail-blocked query', async () => {
            const { dependencies, output } = runNativeResume(
                'SELECT * FROM INFORMATION_SCHEMA.COLUMNS',
            );

            const resolved = await output;
            expect(resolved.metadata?.status).toBe('error');
            expect(resolved.result).toContain('information_schema');
            expect(dependencies.storeToolResults).toHaveBeenCalledWith([
                expect.objectContaining({
                    promptUuid: 'prompt-uuid',
                    toolCallId: 'tool-call-1',
                    toolName: 'runSql',
                    result: resolved.result,
                }),
            ]);
        });

        it('persists a success result for an approved query', async () => {
            const { dependencies, output } =
                runNativeResume('select 1 as answer');

            const resolved = await output;
            expect(resolved.metadata?.status).toBe('success');
            expect(dependencies.storeToolResults).toHaveBeenCalledWith([
                expect.objectContaining({
                    toolCallId: 'tool-call-1',
                    result: resolved.result,
                }),
            ]);
        });
    });
});
