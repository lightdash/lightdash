import {
    getSameTurnSqlApprovalProgressId,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import { type AiSqlApprovalDecision } from '../../../database/entities/ai';
import type {
    CreateContentFn,
    EditContentFn,
    RecordSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';
import { getEditContent } from './editContent';
import { getRunSql } from './runSql';
import { type SqlApprovalDependencies } from './sqlApprovalGate';
import { type SqlApprovalDecisionOnCall } from './sqlApprovals';

const approvedSql = 'select status, count(*) as orders from orders group by 1';
const otherSql = 'select count(*) from customers';

const makePrompt = (promptUuid = 'prompt-1'): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid,
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    threadEmbedSpaceUuid: null,
    externalUserId: null,
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Count orders by status and save it as a chart',
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

type UserAnswer = 'approved' | 'rejected' | 'timeout';

/**
 * Stands in for the stored tool calls and SQL approval decisions: the agent
 * stores each call under its prompt, the user answers prompts, and decisions
 * are written once per call.
 */
const makeTurns = ({
    prompt = makePrompt(),
    useSlackStreamCard = false,
}: {
    prompt?: AiWebAppPrompt | SlackPrompt;
    useSlackStreamCard?: boolean;
} = {}) => {
    let currentPrompt = prompt;
    const calls: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        toolArgs: unknown;
    }> = [];
    const decisions = new Map<
        string,
        { decision: AiSqlApprovalDecision; decidedByUserUuid: string | null }
    >();
    const userAnswers = new Map<string, UserAnswer>();
    const asked: string[] = [];
    const recorded: Parameters<RecordSqlApprovalFn>[0][] = [];

    const decide = (
        toolCallId: string,
        decision: AiSqlApprovalDecision,
        decidedByUserUuid: string | null,
    ): boolean => {
        if (decisions.has(toolCallId)) return false;
        decisions.set(toolCallId, { decision, decidedByUserUuid });
        return true;
    };

    const approval: SqlApprovalDependencies = {
        getPrompt: async () => currentPrompt,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        updateSlackMessage: vi.fn().mockResolvedValue(undefined),
        siteUrl: 'https://lightdash.example',
        waitForSqlApproval: async (toolCallId) => {
            asked.push(toolCallId);
            const answer = userAnswers.get(toolCallId) ?? 'approved';
            if (answer !== 'timeout') decide(toolCallId, answer, 'user-uuid');
            return answer;
        },
        recordSqlApproval: async (args) => {
            recorded.push(args);
            return decide(args.toolCallId, 'approved', args.decidedByUserUuid);
        },
        isThreadSqlAutoApproved: async () => false,
        trackSqlApprovalTimeout: vi.fn(),
        storeToolResults: vi.fn().mockResolvedValue(undefined),
        listSqlApprovalDecisions: async (promptUuid) =>
            calls.flatMap((call): SqlApprovalDecisionOnCall[] => {
                const decision = decisions.get(call.toolCallId);
                return call.promptUuid === promptUuid && decision
                    ? [{ ...call, ...decision }]
                    : [];
            }),
        autoApproveSql: false,
        autoApproveSqlUserUuid: null,
        useSlackStreamCard,
    };

    const saved: string[] = [];
    const createContent = vi.fn(
        async (args: Parameters<CreateContentFn>[0]) => {
            if (args.type !== 'sql_chart') throw new Error('Unexpected type');
            await args.approveSql({
                sql: args.content.sql,
                chartName: args.content.name,
                sqlChanged: true,
            });
            saved.push(args.content.sql);
            return {
                type: 'sql_chart' as const,
                content: args.content,
                uuid: 'sql-chart-uuid',
                href: '/projects/project-uuid/sql-runner/orders-by-status#chart-link',
            };
        },
    );
    const editContent = vi.fn(async (args: Parameters<EditContentFn>[0]) => {
        if (args.type !== 'sql_chart') throw new Error('Unexpected type');
        const [operation] = args.patch as [{ value: string }];
        await args.approveSql({
            sql: operation.value,
            chartName: 'Orders by status',
            sqlChanged: true,
        });
        saved.push(operation.value);
        return {
            type: 'sql_chart' as const,
            content: {
                slug: 'orders-by-status',
                sql: operation.value,
            } as never,
            uuid: 'sql-chart-uuid',
            href: '/projects/project-uuid/sql-runner/orders-by-status#chart-link',
            versionUuids: { before: 'version-before', after: 'version-after' },
        };
    });
    const runSqlJob = vi.fn().mockResolvedValue({
        queryUuid: 'query-uuid',
        rows: [{ orders: 1 }],
        columns: ['orders'],
        rowCount: 1,
    });

    const sqlChartSaving = { mode: 'thread_approval' as const, approval };
    const tools = {
        runSql: getRunSql({
            ...approval,
            runSqlJob,
            sendFile: vi.fn().mockResolvedValue(undefined),
            slackLinksOnly: false,
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxQueryLimit: 5000,
            enableDataAccess: false,
            hyphenatedIdentifiers: true,
        }),
        createContent: getCreateContent({ createContent, sqlChartSaving }),
        editContent: getEditContent({ editContent, sqlChartSaving }),
    };

    const argsFor = {
        runSql: (sql: string) => ({ sql, limit: 500 }),
        createContent: (sql: string) => ({
            type: 'sql_chart' as const,
            content: {
                name: 'Orders by status',
                description: null,
                slug: 'orders-by-status',
                contentType: 'sql_chart' as const,
                spaceSlug: 'sales',
                sql,
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
            },
        }),
        editContent: (sql: string) => ({
            type: 'sql_chart' as const,
            slug: 'orders-by-status',
            patch: [{ op: 'replace', path: '/sql', value: sql }],
        }),
    };

    type ToolName = keyof typeof tools;
    const options = (toolCallId: string) => ({
        toolCallId,
        messages: [],
        context: {},
    });

    /** Stores the call under the current prompt, as the agent does. */
    const storeCall = (toolName: ToolName, toolCallId: string, sql: string) => {
        const toolArgs = argsFor[toolName](sql);
        if (!calls.some((stored) => stored.toolCallId === toolCallId)) {
            calls.push({
                promptUuid: currentPrompt.promptUuid,
                toolCallId,
                toolName,
                toolArgs,
            });
        }
        return toolArgs;
    };

    const call = async (
        toolName: ToolName,
        toolCallId: string,
        sql: string,
    ) => {
        const toolArgs = storeCall(toolName, toolCallId, sql);
        const execute = tools[toolName].execute as unknown as (
            args: unknown,
            opts: ReturnType<typeof options>,
        ) => Promise<{ metadata?: { status?: string } }>;
        return execute(toolArgs, options(toolCallId));
    };

    /** The AI SDK's check before executing a call on Slack. */
    const needsApproval = async (
        toolName: ToolName,
        toolCallId: string,
        sql: string,
    ) =>
        (
            tools[toolName].needsApproval as unknown as (
                args: unknown,
                opts: ReturnType<typeof options>,
            ) => Promise<boolean>
        )(argsFor[toolName](sql), options(toolCallId));

    return {
        call,
        storeCall,
        needsApproval,
        asked,
        recorded,
        saved,
        runSqlJob,
        storeToolResults: approval.storeToolResults,
        updateProgress: approval.updateProgress,
        answer: (toolCallId: string, userAnswer: UserAnswer) =>
            userAnswers.set(toolCallId, userAnswer),
        // A Slack button click records the decision before the run resumes.
        clickSlackButton: (
            toolCallId: string,
            decision: AiSqlApprovalDecision,
        ) => decide(toolCallId, decision, 'user-uuid'),
        startTurn: (promptUuid: string) => {
            currentPrompt = { ...currentPrompt, promptUuid };
        },
    };
};

describe('SQL approved earlier in the same turn', () => {
    it('saves a SQL chart without asking again for SQL the user approved to run', async () => {
        const turns = makeTurns();

        await turns.call('runSql', 'run-1', approvedSql);
        const output = await turns.call(
            'createContent',
            'create-1',
            `${approvedSql};\n`,
        );

        expect(output.metadata?.status).toBe('success');
        expect(turns.asked).toEqual(['run-1']);
        expect(turns.saved).toEqual([`${approvedSql};\n`]);
        expect(turns.recorded).toEqual([
            {
                toolCallId: 'create-1',
                toolName: 'createContent',
                decidedByUserUuid: 'user-uuid',
                source: 'same_turn_approval',
            },
        ]);
        // Tells the web chat to drop this call's approval buttons.
        expect(turns.updateProgress).toHaveBeenLastCalledWith(
            'SQL already approved earlier in this turn',
            'createContent',
            getSameTurnSqlApprovalProgressId('create-1'),
            'complete',
        );
    });

    it('runs SQL without asking again once a SQL chart with it was saved', async () => {
        const turns = makeTurns();

        await turns.call('createContent', 'create-1', approvedSql);
        await turns.call('runSql', 'run-1', approvedSql);

        expect(turns.asked).toEqual(['create-1']);
        expect(turns.runSqlJob).toHaveBeenCalledOnce();
    });

    it('saves a SQL chart edit without asking again for approved SQL', async () => {
        const turns = makeTurns();

        await turns.call('runSql', 'run-1', approvedSql);
        await turns.call('editContent', 'edit-1', approvedSql);

        expect(turns.asked).toEqual(['run-1']);
        expect(turns.saved).toEqual([approvedSql]);
    });

    it('asks again for different SQL', async () => {
        const turns = makeTurns();

        await turns.call('runSql', 'run-1', approvedSql);
        await turns.call('createContent', 'create-1', otherSql);

        expect(turns.asked).toEqual(['run-1', 'create-1']);
    });

    it('asks again when the user rejected the same SQL', async () => {
        const turns = makeTurns();
        turns.answer('run-1', 'rejected');

        await turns.call('runSql', 'run-1', approvedSql);
        await turns.call('createContent', 'create-1', approvedSql);

        expect(turns.asked).toEqual(['run-1', 'create-1']);
        expect(turns.recorded).toEqual([]);
    });

    it('asks again in a later turn', async () => {
        const turns = makeTurns();

        await turns.call('runSql', 'run-1', approvedSql);
        turns.startTurn('prompt-2');
        await turns.call('createContent', 'create-1', approvedSql);

        expect(turns.asked).toEqual(['run-1', 'create-1']);
    });

    it('does not suspend a Slack run again for SQL approved earlier in the turn', async () => {
        const turns = makeTurns({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
        });

        await expect(
            turns.needsApproval('runSql', 'run-1', approvedSql),
        ).resolves.toBe(true);
        turns.storeCall('runSql', 'run-1', approvedSql);
        turns.clickSlackButton('run-1', 'approved');
        await turns.call('runSql', 'run-1', approvedSql);
        expect(turns.storeToolResults).toHaveBeenCalledExactlyOnceWith([
            expect.objectContaining({ toolCallId: 'run-1' }),
        ]);

        await expect(
            turns.needsApproval('createContent', 'create-1', approvedSql),
        ).resolves.toBe(false);
        await expect(
            turns.needsApproval('createContent', 'create-2', otherSql),
        ).resolves.toBe(true);
        await turns.call('createContent', 'create-1', approvedSql);

        expect(turns.saved).toEqual([approvedSql]);
        expect(turns.asked).toEqual([]);
        expect(turns.recorded).toEqual([
            expect.objectContaining({
                toolCallId: 'create-1',
                source: 'same_turn_approval',
            }),
        ]);
        // Ran in the same run, so onStepFinish stores its result, not the gate.
        expect(turns.storeToolResults).toHaveBeenCalledOnce();
        expect(turns.updateProgress).not.toHaveBeenCalled();
    });

    it('still suspends a Slack run when the same SQL was rejected', async () => {
        const turns = makeTurns({
            prompt: makeSlackPrompt(),
            useSlackStreamCard: true,
        });

        turns.storeCall('runSql', 'run-1', approvedSql);
        turns.clickSlackButton('run-1', 'rejected');

        await expect(
            turns.needsApproval('createContent', 'create-1', approvedSql),
        ).resolves.toBe(true);
    });
});
