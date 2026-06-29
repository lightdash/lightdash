import { type AiWebAppPrompt } from '@lightdash/common';
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

const makeTool = ({
    autoApproveSql = false,
    autoApproveSqlUserUuid = null,
    waitForSqlApproval = vi.fn().mockResolvedValue('approved'),
    recordSqlApproval = vi.fn().mockResolvedValue(true),
    maxQueryLimit = 5000,
}: MakeToolOptions = {}) => {
    const dependencies = {
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runSqlJob: vi.fn().mockResolvedValue({
            rows: [{ answer: 1 }],
            columns: ['answer'],
            rowCount: 1,
        }),
        getPrompt: vi.fn().mockResolvedValue(makePrompt()),
        sendFile: vi.fn().mockResolvedValue(undefined),
        updateSlackMessage: vi.fn().mockResolvedValue(undefined),
        siteUrl: 'https://lightdash.example',
        waitForSqlApproval,
        recordSqlApproval,
        storeToolResults: vi.fn().mockResolvedValue(undefined),
        autoApproveSql,
        autoApproveSqlUserUuid,
        maxQueryLimit,
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
});
