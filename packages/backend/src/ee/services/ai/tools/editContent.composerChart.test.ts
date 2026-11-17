import {
    toolEditContentOutputSchema,
    type AiWebAppPrompt,
} from '@lightdash/common';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getEditContent } from './editContent';
import { SQL_CHART_REJECTED_RESULT } from './sqlApprovals';
import { type SqlChartSaving } from './sqlChartApproval';

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

const makeApproval = (decision: 'approved' | 'rejected' = 'approved') => ({
    getPrompt: vi.fn().mockResolvedValue(prompt),
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
    useSlackStreamCard: false,
});

// Mirrors the content service: approval only for new warehouse SQL, refused without SQL mode.
const makeTool = (sqlChartSaving: SqlChartSaving) => {
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
        };
    });
    const tool = getEditContent({
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
    return { execute, save };
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
});
