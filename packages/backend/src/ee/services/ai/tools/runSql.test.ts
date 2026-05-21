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
    waitForSqlApproval?: jest.Mock;
    recordSqlApproval?: jest.Mock;
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
    waitForSqlApproval = jest.fn().mockResolvedValue('approved'),
    recordSqlApproval = jest.fn().mockResolvedValue(true),
}: MakeToolOptions = {}) => {
    const dependencies = {
        updateProgress: jest.fn().mockResolvedValue(undefined),
        runSqlJob: jest.fn().mockResolvedValue({
            rows: [{ answer: 1 }],
            columns: ['answer'],
            rowCount: 1,
        }),
        getPrompt: jest.fn().mockResolvedValue(makePrompt()),
        sendFile: jest.fn().mockResolvedValue(undefined),
        updateSlackMessage: jest.fn().mockResolvedValue(undefined),
        siteUrl: 'https://lightdash.example',
        waitForSqlApproval,
        recordSqlApproval,
        autoApproveSql,
        autoApproveSqlUserUuid,
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
});
