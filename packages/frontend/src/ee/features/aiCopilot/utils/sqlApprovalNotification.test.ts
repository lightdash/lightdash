import { QuerySourceType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    type AiAgentThreadStreamingState,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import {
    getAwaitingSqlApprovals,
    getSqlApprovalNotificationClickAction,
    getSqlApprovalNotificationContent,
} from './sqlApprovalNotification';

const toolCall = (
    toolCallId: string,
    toolName: string,
    toolArgs: object,
    overrides: { toolResult?: unknown; isArgsPartial?: boolean } = {},
): StreamPart =>
    // Tool names and args are a typed union; tests only need their shape.
    ({
        type: 'toolCall',
        toolCallId,
        toolName,
        toolArgs,
        toolResult: null,
        ...overrides,
    }) as StreamPart;

const stream = (
    overrides: Partial<AiAgentThreadStreamingState>,
): AiAgentThreadStreamingState => ({
    threadUuid: 'thread-1',
    messageUuid: 'message-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    autoApproveSql: false,
    content: '',
    parts: [],
    connection: { status: 'streaming' },
    toolCalls: [],
    reasoning: [],
    decidedToolCallIds: [],
    stepProgressMessages: [],
    timing: { startedAt: 0, firstTokenAt: null, finishedAt: null },
    ...overrides,
});

const neverAutoApproved = () => false;

describe('getAwaitingSqlApprovals', () => {
    it('returns a runSql call waiting on the user', () => {
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({
                        parts: [
                            { type: 'text', text: 'Let me check' },
                            toolCall('call-1', 'runSql', { sql: 'select 1' }),
                        ],
                    }),
                ],
                neverAutoApproved,
            ),
        ).toEqual([
            {
                toolCallId: 'call-1',
                threadUuid: 'thread-1',
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
            },
        ]);
    });

    it('returns a composer call only when it runs warehouse SQL', () => {
        const composer = (sourceType: QuerySourceType) => ({
            queries: [{ nodeId: 'n1', sourceType }],
        });
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({
                        parts: [
                            toolCall(
                                'sql-composer',
                                'runComposerQueries',
                                composer(QuerySourceType.SQL),
                            ),
                            toolCall(
                                'semantic-composer',
                                'runComposerQueries',
                                composer(QuerySourceType.SEMANTIC_LAYER),
                            ),
                        ],
                    }),
                ],
                neverAutoApproved,
            ).map(({ toolCallId }) => toolCallId),
        ).toEqual(['sql-composer']);
    });

    it('returns SQL chart content calls only when they save new SQL', () => {
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({
                        parts: [
                            toolCall('create-sql-chart', 'createContent', {
                                type: 'sql_chart',
                                content: { sql: 'select 1' },
                            }),
                            toolCall('edit-sql', 'editContent', {
                                type: 'sql_chart',
                                patch: [
                                    {
                                        op: 'replace',
                                        path: '/sql',
                                        value: 'select 2',
                                    },
                                ],
                            }),
                            toolCall('edit-name', 'editContent', {
                                type: 'sql_chart',
                                patch: [
                                    {
                                        op: 'replace',
                                        path: '/name',
                                        value: 'Renamed',
                                    },
                                ],
                            }),
                            toolCall('create-chart', 'createContent', {
                                type: 'chart',
                            }),
                        ],
                    }),
                ],
                neverAutoApproved,
            ).map(({ toolCallId }) => toolCallId),
        ).toEqual(['create-sql-chart', 'edit-sql']);
    });

    it('skips calls that are not waiting on the user', () => {
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({
                        decidedToolCallIds: ['decided'],
                        parts: [
                            toolCall('decided', 'runSql', { sql: 'select 1' }),
                            toolCall(
                                'finished',
                                'runSql',
                                { sql: 'select 1' },
                                { toolResult: 'rows' },
                            ),
                            toolCall(
                                'still-typing',
                                'runSql',
                                { sql: 'sel' },
                                { isArgsPartial: true },
                            ),
                            toolCall('no-approval', 'findFields', {}),
                        ],
                    }),
                ],
                neverAutoApproved,
            ),
        ).toEqual([]);
    });

    it('skips approvals settled automatically', () => {
        const parts = [toolCall('call-1', 'runSql', { sql: 'select 1' })];
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({ threadUuid: 'server-approved', parts }),
                    stream({ threadUuid: 'always-approved', parts }),
                ].map((s) =>
                    s.threadUuid === 'server-approved'
                        ? { ...s, autoApproveSql: true }
                        : s,
                ),
                (threadUuid) => threadUuid === 'always-approved',
            ),
        ).toEqual([]);
    });

    it('keeps watching a stream while it recovers', () => {
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({
                        connection: { status: 'recovering' },
                        parts: [
                            toolCall('call-1', 'runSql', { sql: 'select 1' }),
                        ],
                    }),
                ],
                neverAutoApproved,
            ).map(({ toolCallId }) => toolCallId),
        ).toEqual(['call-1']);
    });

    it('skips streams that are no longer live', () => {
        const parts = [toolCall('call-1', 'runSql', { sql: 'select 1' })];
        expect(
            getAwaitingSqlApprovals(
                [
                    stream({ connection: { status: 'complete' }, parts }),
                    stream({
                        connection: { status: 'error', error: 'boom' },
                        parts,
                    }),
                ],
                neverAutoApproved,
            ),
        ).toEqual([]);
    });
});

describe('getSqlApprovalNotificationClickAction', () => {
    const threadUuid = 'thread-1';

    it('only focuses when the thread page is already open', () => {
        expect(
            getSqlApprovalNotificationClickAction({
                threadUuid,
                pathname: '/projects/p/ai-agents/a/threads/thread-1',
                launcherThreadUuid: null,
            }),
        ).toBe('focus');
    });

    it('opens the launcher panel when the launcher holds the thread', () => {
        expect(
            getSqlApprovalNotificationClickAction({
                threadUuid,
                pathname: '/projects/p/dashboards/d',
                launcherThreadUuid: threadUuid,
            }),
        ).toBe('openLauncher');
    });

    it('navigates to the thread page otherwise', () => {
        expect(
            getSqlApprovalNotificationClickAction({
                threadUuid,
                pathname: '/projects/p/dashboards/d',
                launcherThreadUuid: null,
            }),
        ).toBe('navigate');
        expect(
            getSqlApprovalNotificationClickAction({
                threadUuid,
                pathname: '/projects/p/ai-agents/a/threads/other-thread',
                launcherThreadUuid: 'other-thread',
            }),
        ).toBe('navigate');
    });
});

describe('getSqlApprovalNotificationContent', () => {
    it('names the agent and never the SQL', () => {
        expect(getSqlApprovalNotificationContent('Sales agent')).toEqual({
            title: 'Approval needed',
            body: 'Sales agent',
        });
    });

    it('falls back when the agent name is unknown', () => {
        expect(getSqlApprovalNotificationContent(null)).toEqual({
            title: 'Approval needed',
            body: 'AI agent',
        });
    });
});
