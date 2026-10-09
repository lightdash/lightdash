import {
    toolCreateContentOutputSchema,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';
import { SQL_CHART_REJECTED_RESULT } from './sqlApprovals';
import {
    SQL_CHART_DISABLED_RESULT,
    SQL_CHART_PREVIOUS_TIMEOUT_RESULT,
    SQL_CHART_TIMEOUT_RESULT,
    type SqlChartSaving,
} from './sqlChartApproval';

const sqlChart = {
    name: 'Orders by status',
    description: null,
    slug: 'orders-by-status',
    contentType: 'sql_chart' as const,
    spaceSlug: 'sales',
    sql: 'select status, count(*) as orders from orders group by 1',
    limit: 500,
    chartKind: 'vertical_bar' as const,
    version: 1,
    config: {
        metadata: { version: 1 },
        type: 'vertical_bar' as const,
        fieldConfig: {
            x: { reference: 'status', type: 'category' },
            y: [{ reference: 'orders', aggregation: 'sum' }],
            groupBy: [],
        },
        display: {},
    },
};

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
    prompt: 'Save this query as a chart',
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

// The content service asks for approval after validation and only saves once
// it resolves, so this fake mirrors that ordering.
const makeCreateContent = () => {
    const save = vi.fn();
    const createContent = vi.fn(
        async (args: Parameters<CreateContentFn>[0]) => {
            if (args.type !== 'sql_chart') {
                throw new Error('Unexpected content type');
            }
            await args.approveSql();
            save(args.content);
            return {
                type: 'sql_chart' as const,
                content: { ...args.content, slug: 'orders-by-status-1' },
                uuid: 'sql-chart-uuid',
                href: '/projects/project-uuid/sql-runner/orders-by-status-1#chart-link',
            };
        },
    );
    return { createContent, save };
};

const makeApproval = ({
    decision = 'approved',
    prompt = makePrompt(),
    autoApproveSql = false,
    threadAutoApproved = false,
    useSlackStreamCard = false,
    recorded = true,
}: {
    decision?: 'approved' | 'rejected' | 'timeout';
    prompt?: AiWebAppPrompt | SlackPrompt;
    autoApproveSql?: boolean;
    threadAutoApproved?: boolean;
    useSlackStreamCard?: boolean;
    recorded?: boolean;
} = {}) => ({
    getPrompt: vi.fn().mockResolvedValue(prompt),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateSlackMessage: vi.fn().mockResolvedValue(undefined),
    siteUrl: 'https://lightdash.example',
    waitForSqlApproval: vi.fn().mockResolvedValue(decision),
    recordSqlApproval: vi.fn().mockResolvedValue(recorded),
    isThreadSqlAutoApproved: vi.fn().mockResolvedValue(threadAutoApproved),
    trackSqlApprovalTimeout: vi.fn(),
    storeToolResults: vi.fn().mockResolvedValue(undefined),
    autoApproveSql,
    autoApproveSqlUserUuid: autoApproveSql ? 'user-uuid' : null,
    useSlackStreamCard,
});

const makeTool = (sqlChartSaving: SqlChartSaving) => {
    const { createContent, save } = makeCreateContent();
    return {
        tool: getCreateContent({ createContent, sqlChartSaving }),
        createContent,
        save,
    };
};

const execute = async (
    tool: ReturnType<typeof getCreateContent>,
    toolCallId = 'tool-call-1',
) =>
    toolCreateContentOutputSchema.parse(
        await tool.execute!(
            { type: 'sql_chart', content: sqlChart },
            { toolCallId, messages: [], context: {} },
        ),
    );

describe('createContent SQL charts', () => {
    it('saves the SQL chart once the user approves its SQL', async () => {
        const approval = makeApproval();
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool);

        expect(approval.updateProgress).toHaveBeenCalledWith(
            'Awaiting approval to save SQL chart...',
        );
        expect(approval.waitForSqlApproval).toHaveBeenCalledWith('tool-call-1');
        expect(save).toHaveBeenCalledOnce();
        expect(output.metadata).toMatchObject({
            status: 'success',
            slug: 'orders-by-status-1',
            href: '/projects/project-uuid/sql-runner/orders-by-status-1#chart-link',
        });
        expect(output.structuredContent).toMatchObject({
            type: 'sql_chart',
            slug: 'orders-by-status-1',
        });
    });

    it('writes nothing and declines when the user rejects the SQL', async () => {
        const approval = makeApproval({ decision: 'rejected' });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool);

        expect(save).not.toHaveBeenCalled();
        expect(output).toEqual({
            result: SQL_CHART_REJECTED_RESULT,
            metadata: { status: 'error' },
            structuredContent: { error: SQL_CHART_REJECTED_RESULT },
        });
    });

    it('skips the prompt when the thread approved SQL once and for all', async () => {
        const approval = makeApproval({ threadAutoApproved: true });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(approval.recordSqlApproval).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'createContent',
            decidedByUserUuid: null,
            source: 'thread_auto_approve',
        });
        expect(save).toHaveBeenCalledOnce();
    });

    it('records an agent auto-approval without prompting', async () => {
        const approval = makeApproval({ autoApproveSql: true });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(approval.recordSqlApproval).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'createContent',
            decidedByUserUuid: 'user-uuid',
            source: 'auto_approve',
        });
        expect(save).toHaveBeenCalledOnce();
    });

    it('tracks a timed-out approval and stops asking for the rest of the response', async () => {
        const approval = makeApproval({
            decision: 'timeout',
            prompt: makeSlackPrompt(),
        });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const first = await execute(tool, 'tool-call-1');
        const second = await execute(tool, 'tool-call-2');

        expect(first.result).toBe(SQL_CHART_TIMEOUT_RESULT);
        expect(second.result).toBe(SQL_CHART_PREVIOUS_TIMEOUT_RESULT);
        expect(approval.waitForSqlApproval).toHaveBeenCalledOnce();
        expect(approval.trackSqlApprovalTimeout).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'createContent',
            promptedUserUuid: 'user-uuid',
            source: 'slack',
        });
        expect(save).not.toHaveBeenCalled();
    });

    it('posts Slack approval buttons on the legacy Slack path', async () => {
        const approval = makeApproval({ prompt: makeSlackPrompt() });
        const { tool } = makeTool({ mode: 'thread_approval', approval });

        await execute(tool);

        const [{ blocks }] = approval.updateSlackMessage.mock.calls[0];
        expect(JSON.stringify(blocks)).toContain(
            'Awaiting approval to save SQL chart \\"Orders by status\\"',
        );
        expect(JSON.stringify(blocks)).toContain(
            'actions.sql_approval:tool-call-1:thread-uuid:approved',
        );
    });

    it('defers to native approval on Slack stream cards and persists the resumed result', async () => {
        const approval = makeApproval({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
        });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const needsApproval = tool.needsApproval as (
            input: unknown,
        ) => Promise<boolean>;
        await expect(
            needsApproval({ type: 'sql_chart', content: sqlChart }),
        ).resolves.toBe(true);
        await expect(
            needsApproval({ type: 'chart', content: {} }),
        ).resolves.toBe(false);

        await execute(tool);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledOnce();
        expect(approval.storeToolResults).toHaveBeenCalledWith([
            expect.objectContaining({
                promptUuid: 'prompt-uuid',
                toolCallId: 'tool-call-1',
                toolName: 'createContent',
                metadata: expect.objectContaining({ status: 'success' }),
            }),
        ]);
    });

    it('refuses SQL charts when the agent has no SQL mode', async () => {
        const { tool, createContent } = makeTool({ mode: 'disabled' });

        const output = await execute(tool);

        expect(output.result).toBe(SQL_CHART_DISABLED_RESULT);
        expect(createContent).not.toHaveBeenCalled();
    });

    it('saves straight away for MCP clients, which approve their own tool calls', async () => {
        const { tool, save } = makeTool({ mode: 'client_approved' });

        const output = await execute(tool);

        expect(output.metadata.status).toBe('success');
        expect(save).toHaveBeenCalledOnce();
        await expect(
            (tool.needsApproval as (input: unknown) => Promise<boolean>)({
                type: 'sql_chart',
                content: sqlChart,
            }),
        ).resolves.toBe(false);
    });
});
