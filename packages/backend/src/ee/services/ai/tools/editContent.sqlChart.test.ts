import {
    toolEditContentOutputSchema,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getEditContent } from './editContent';
import { SQL_CHART_REJECTED_RESULT } from './sqlApprovals';
import {
    SQL_CHART_DISABLED_RESULT,
    type SqlChartSaving,
} from './sqlChartApproval';

const currentSql = 'select status, count(*) as orders from orders group by 1';

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

// Mirrors the content service: approval is requested when the patch touches
// the SQL, and the edit is saved only once it resolves.
const makeEditContent = () => {
    const save = vi.fn();
    const editContent = vi.fn(async (args: Parameters<EditContentFn>[0]) => {
        if (args.type !== 'sql_chart' || !Array.isArray(args.patch)) {
            throw new Error('Unexpected content type');
        }
        const sqlOperation = args.patch.find(
            (operation: { path?: string }) => operation.path === '/sql',
        ) as { value: string } | undefined;
        const sql = sqlOperation?.value ?? currentSql;
        if (sqlOperation) {
            await args.approveSql({
                sql,
                chartName: 'Orders by status',
                sqlChanged: sql !== currentSql,
            });
        }
        save(sql);
        return {
            type: 'sql_chart' as const,
            content: {
                name: 'Orders by status',
                description: null,
                slug: 'orders-by-status',
                spaceSlug: 'sales',
                sql,
                limit: 500,
                chartKind: 'vertical_bar',
                version: 1,
                config: { metadata: { version: 1 }, type: 'vertical_bar' },
            } as never,
            uuid: 'sql-chart-uuid',
            href: '/projects/project-uuid/sql-runner/orders-by-status#chart-link',
            versionUuids: { before: 'version-before', after: 'version-after' },
        };
    });
    return { editContent, save };
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
    const { editContent, save } = makeEditContent();
    return {
        tool: getEditContent({ editContent, sqlChartSaving }),
        editContent,
        save,
    };
};

const renamePatch = [
    { op: 'replace', path: '/name', value: 'Orders per status' },
];
const sqlPatch = [
    { op: 'replace', path: '/sql', value: 'select status from orders' },
];

const execute = async (
    tool: ReturnType<typeof getEditContent>,
    patch: unknown[],
) =>
    toolEditContentOutputSchema.parse(
        await tool.execute!(
            { slug: 'orders-by-status', type: 'sql_chart', patch },
            { toolCallId: 'tool-call-1', messages: [], context: {} },
        ),
    );

describe('editContent SQL charts', () => {
    it('saves an edit that leaves the SQL untouched without a prompt', async () => {
        const approval = makeApproval();
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool, renamePatch);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(approval.recordSqlApproval).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(currentSql);
        expect(output.metadata).toMatchObject({
            status: 'success',
            slug: 'orders-by-status',
            href: '/projects/project-uuid/sql-runner/orders-by-status#chart-link',
        });
        expect(output.structuredContent).toMatchObject({ type: 'sql_chart' });
    });

    it('saves an edit that changes the SQL once the user approves it', async () => {
        const approval = makeApproval();
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool, sqlPatch);

        expect(approval.waitForSqlApproval).toHaveBeenCalledWith('tool-call-1');
        expect(save).toHaveBeenCalledWith('select status from orders');
        expect(output.metadata.status).toBe('success');
    });

    it('writes nothing when the user rejects the new SQL', async () => {
        const approval = makeApproval({ decision: 'rejected' });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool, sqlPatch);

        expect(save).not.toHaveBeenCalled();
        expect(output.result).toBe(SQL_CHART_REJECTED_RESULT);
    });

    it('skips the prompt when the thread approved SQL once and for all', async () => {
        const approval = makeApproval({ threadAutoApproved: true });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool, sqlPatch);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(approval.recordSqlApproval).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'editContent',
            decidedByUserUuid: null,
            source: 'thread_auto_approve',
        });
        expect(save).toHaveBeenCalledOnce();
    });

    it('tracks a timed-out approval as an editContent decision', async () => {
        const approval = makeApproval({ decision: 'timeout' });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool, sqlPatch);

        expect(approval.trackSqlApprovalTimeout).toHaveBeenCalledWith({
            toolCallId: 'tool-call-1',
            toolName: 'editContent',
            promptedUserUuid: 'user-uuid',
            source: 'web',
        });
        expect(save).not.toHaveBeenCalled();
    });

    it('needs native Slack approval only for patches that can change the SQL', async () => {
        const approval = makeApproval({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
        });
        const { tool } = makeTool({ mode: 'thread_approval', approval });
        const needsApproval = tool.needsApproval as (
            input: unknown,
        ) => Promise<boolean>;

        await expect(
            needsApproval({
                slug: 'orders-by-status',
                type: 'sql_chart',
                patch: sqlPatch,
            }),
        ).resolves.toBe(true);
        await expect(
            needsApproval({
                slug: 'orders-by-status',
                type: 'sql_chart',
                patch: renamePatch,
            }),
        ).resolves.toBe(false);
        // Rejected by the content service before any approval prompt.
        await expect(
            needsApproval({
                slug: 'orders-by-status',
                type: 'sql_chart',
                patch: [
                    ...sqlPatch,
                    { op: 'copy', from: '/description', path: '/sql' },
                ],
            }),
        ).resolves.toBe(false);
    });

    it('persists the result when a natively approved edit resumes', async () => {
        const approval = makeApproval({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
        });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool, sqlPatch);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledOnce();
        expect(approval.storeToolResults).toHaveBeenCalledWith([
            expect.objectContaining({
                toolCallId: 'tool-call-1',
                toolName: 'editContent',
            }),
        ]);
    });

    it('persists the result when an "approve & don\'t ask again" edit resumes with unchanged SQL', async () => {
        // The Slack button recorded the decision and flipped the thread to
        // auto-approve before the run resumed.
        const approval = makeApproval({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
            threadAutoApproved: true,
            recorded: false,
        });
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(tool, [
            { op: 'replace', path: '/sql', value: currentSql },
        ]);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(currentSql);
        expect(approval.storeToolResults).toHaveBeenCalledWith([
            expect.objectContaining({
                toolCallId: 'tool-call-1',
                toolName: 'editContent',
                result: output.result,
            }),
        ]);
    });

    it('saves an unchanged SQL patch without prompting', async () => {
        const approval = makeApproval();
        const { tool, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        await execute(tool, [
            { op: 'replace', path: '/sql', value: currentSql },
        ]);

        expect(approval.waitForSqlApproval).not.toHaveBeenCalled();
        expect(approval.storeToolResults).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(currentSql);
    });

    it('refuses SQL chart edits when the agent has no SQL mode', async () => {
        const { tool, editContent } = makeTool({ mode: 'disabled' });

        const output = await execute(tool, renamePatch);

        expect(output.result).toBe(SQL_CHART_DISABLED_RESULT);
        expect(editContent).not.toHaveBeenCalled();
    });
});
