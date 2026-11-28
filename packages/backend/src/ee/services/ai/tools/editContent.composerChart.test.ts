import {
    toolEditContentOutputSchema,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getEditContent } from './editContent';
import { SQL_CHART_REJECTED_RESULT } from './sqlApprovals';
import {
    COMPOSER_CHART_SQL_UNASKED_RESULT,
    type SqlChartSaving,
} from './sqlChartApproval';

const prompt: AiWebAppPrompt = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    threadEmbedSpaceUuid: null,
    threadEmbedOwnerIdentifier: null,
    externalUserId: null,
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Make this a bar chart',
    createdAt: new Date('2026-11-17T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
    battleProfile: null,
};

const slackPrompt: SlackPrompt = {
    ...prompt,
    response_slack_ts: 'response-ts',
    slackUserId: 'slack-user',
    slackChannelId: 'slack-channel',
    promptSlackTs: 'prompt-ts',
    slackThreadTs: 'thread-ts',
};

const makeApproval = (
    decision: 'approved' | 'rejected' = 'approved',
    { slack = false }: { slack?: boolean } = {},
) => ({
    getPrompt: vi.fn().mockResolvedValue(slack ? slackPrompt : prompt),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateSlackMessage: vi.fn().mockResolvedValue(undefined),
    siteUrl: 'https://lightdash.example',
    waitForSqlApproval: vi.fn().mockResolvedValue(decision),
    recordSqlApproval: vi.fn().mockResolvedValue(true),
    isThreadSqlAutoApproved: vi.fn().mockResolvedValue(false),
    listSqlApprovalDecisions: vi.fn().mockResolvedValue([]),
    trackSqlApprovalTimeout: vi.fn(),
    storeToolResults: vi.fn().mockResolvedValue(undefined),
    autoApproveSql: false,
    autoApproveSqlUserUuid: null,
    useSlackStreamCard: slack,
});

// Mirrors the content service: approval only for new warehouse SQL, refused without SQL mode.
const makeTool = (
    sqlChartSaving: SqlChartSaving,
    prepareComposerChartEdit:
        | import('../types/aiAgentDependencies').PrepareComposerChartEditFn
        | null = null,
) => {
    const save = vi.fn();
    const editContent = vi.fn(async (args: Parameters<EditContentFn>[0]) => {
        if (args.type !== 'composer_chart' || !Array.isArray(args.patch)) {
            throw new Error('Unexpected content type');
        }
        const addsSql = args.patch.some(
            (operation: { path?: string }) =>
                operation.path === '/pipeline/nodes/0/sql',
        );
        if (addsSql) {
            if (!args.approveSql) throw new Error('needs SQL mode');
            await args.approveSql({
                sql: 'select 2',
                nodeSql: null,
                chartName: 'Orders',
                sqlChanged: true,
            });
        }
        save();
        return {
            type: 'composer_chart' as const,
            content: { slug: 'orders', name: 'Orders' } as never,
            uuid: 'composer-chart-uuid',
            href: '/projects/project-uuid/dashboards/ops-uuid/view#dashboard-link',
            versionUuids: { before: 'v1', after: 'v2' },
            warnings: [],
        };
    });
    const tool = getEditContent({
        prepareComposerChartEdit,
        siteUrl: 'https://app.lightdash.cloud',
        editContent,
        sqlChartSaving,
    });
    const execute = async (patch: unknown[]) =>
        toolEditContentOutputSchema.parse(
            await tool.execute!(
                { slug: 'orders', type: 'composer_chart', patch },
                { toolCallId: 'tool-call-1', messages: [], context: {} },
            ),
        );
    const needsApproval = (patch: unknown[]) =>
        (
            tool.needsApproval as (
                args: unknown,
                options: { toolCallId: string },
            ) => Promise<boolean>
        )(
            { slug: 'orders', type: 'composer_chart', patch },
            { toolCallId: 'tool-call-1' },
        );
    return { execute, save, needsApproval };
};

const chartTypePatch = [
    { op: 'replace', path: '/chart/chartConfig/type', value: 'cartesian' },
];
const sqlPatch = [
    { op: 'replace', path: '/pipeline/nodes/0/sql', value: 'select 2' },
];

describe('editContent composer charts', () => {
    it('saves an edit without new SQL when SQL mode is off', async () => {
        const { execute, save } = makeTool({ mode: 'disabled' });

        const output = await execute(chartTypePatch);

        expect(save).toHaveBeenCalledOnce();
        expect(output.metadata).toMatchObject({
            status: 'success',
            versionUuids: { before: 'v1', after: 'v2' },
        });
    });

    it('asks the thread to approve new SQL and saves once approved', async () => {
        const approval = makeApproval();
        const { execute, save } = makeTool({
            mode: 'thread_approval',
            approval,
        });

        const output = await execute(sqlPatch);

        expect(approval.waitForSqlApproval).toHaveBeenCalledWith('tool-call-1');
        expect(save).toHaveBeenCalledOnce();
        expect(output.metadata.status).toBe('success');
    });

    it('writes nothing when the user rejects the new SQL', async () => {
        const { execute, save } = makeTool({
            mode: 'thread_approval',
            approval: makeApproval('rejected'),
        });

        const output = await execute(sqlPatch);

        expect(save).not.toHaveBeenCalled();
        expect(output.result).toBe(SQL_CHART_REJECTED_RESULT);
    });

    it('asks Slack to approve only the new warehouse SQL the server finds in the edit', async () => {
        const prepare = vi.fn(async ({ patch }: { patch: unknown }) => {
            const is = (expected: unknown[]) =>
                JSON.stringify(patch) === JSON.stringify(expected);
            if (is(sqlPatch))
                return {
                    approval: { sql: 'select 2', nodeSql: ['select 2'] },
                };
            if (is(chartTypePatch)) return { approval: null };
            throw new Error('You cannot write SQL nodes');
        });
        const { needsApproval } = makeTool(
            {
                mode: 'thread_approval',
                approval: makeApproval('approved', { slack: true }),
            },
            prepare,
        );

        await expect(needsApproval(sqlPatch)).resolves.toBe(true);
        // A DuckDB node's sql, or a SQL node left as it was, adds no warehouse SQL.
        await expect(needsApproval(chartTypePatch)).resolves.toBe(false);
        // A refused edit asks nothing; running it reports the refusal.
        await expect(
            needsApproval([{ op: 'replace', path: '/name', value: 'x' }]),
        ).resolves.toBe(false);
    });

    it('saves no SQL on Slack when the approval check failed but the edit then finds SQL', async () => {
        const prepare = vi
            .fn()
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValue({
                approval: { sql: 'select 2', nodeSql: ['select 2'] },
            });
        const { needsApproval, execute, save } = makeTool(
            {
                mode: 'thread_approval',
                approval: makeApproval('approved', { slack: true }),
            },
            prepare,
        );

        await expect(needsApproval(sqlPatch)).resolves.toBe(false);
        const output = await execute(sqlPatch);

        expect(save).not.toHaveBeenCalled();
        expect(output.result).toContain(COMPOSER_CHART_SQL_UNASKED_RESULT);
    });

    it('saves no SQL on Slack when every check before the save failed', async () => {
        const prepare = vi
            .fn()
            .mockRejectedValue(new Error('database unavailable'));
        const { needsApproval, execute, save } = makeTool(
            {
                mode: 'thread_approval',
                approval: makeApproval('approved', { slack: true }),
            },
            prepare,
        );

        await expect(needsApproval(sqlPatch)).resolves.toBe(false);
        const output = await execute(sqlPatch);

        expect(save).not.toHaveBeenCalled();
        expect(output.result).toContain(COMPOSER_CHART_SQL_UNASKED_RESULT);
    });
});
