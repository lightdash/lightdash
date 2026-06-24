import { AiAgentService } from './AiAgentService';

type Row = Parameters<
    typeof AiAgentService.buildToolCallTurnMessages
>[0][number];

const call = (toolCallId: string, sql: string) =>
    ({ toolCallId, toolName: 'runSql', toolArgs: { sql } }) as Row['toolCall'];

const result = (toolCallId: string, value: string) =>
    ({
        toolCallId,
        toolName: 'runSql',
        result: value,
        metadata: {},
    }) as Row['toolResult'];

const content = (msg: { content: unknown }) => msg.content as Array<AnyType>;

type AnyType = Record<string, unknown> & { type: string };

describe('AiAgentService SQL-approval history reconstruction', () => {
    it('a normal tool call emits assistant(call) + tool(result), no approval parts', () => {
        const msgs = AiAgentService.buildToolCallTurnMessages(
            [
                {
                    toolCall: call('tc1', 'SELECT 1'),
                    toolResult: result('tc1', '3 rows'),
                    approvalDecision: null,
                },
            ],
            false,
        );

        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe('assistant');
        expect(content(msgs[0])).toEqual([
            {
                type: 'tool-call',
                toolCallId: 'tc1',
                toolName: 'runSql',
                input: { sql: 'SELECT 1' },
            },
        ]);
        expect(msgs[1].role).toBe('tool');
        expect(content(msgs[1])[0].type).toBe('tool-result');
    });

    it('approved-but-unexecuted call on the CURRENT prompt emits request + response and NO result (the resume input)', () => {
        const msgs = AiAgentService.buildToolCallTurnMessages(
            [
                {
                    toolCall: call('tc1', 'SELECT 1'),
                    toolResult: null,
                    approvalDecision: 'approved',
                },
            ],
            true,
        );

        expect(msgs).toHaveLength(2);
        expect(content(msgs[0])).toEqual([
            {
                type: 'tool-call',
                toolCallId: 'tc1',
                toolName: 'runSql',
                input: { sql: 'SELECT 1' },
            },
            {
                type: 'tool-approval-request',
                approvalId: 'sql-approval:tc1',
                toolCallId: 'tc1',
            },
        ]);
        expect(content(msgs[1])).toEqual([
            {
                type: 'tool-approval-response',
                approvalId: 'sql-approval:tc1',
                approved: true,
            },
        ]);
    });

    it('rejected call emits an approval-response with approved=false', () => {
        const msgs = AiAgentService.buildToolCallTurnMessages(
            [
                {
                    toolCall: call('tc1', 'SELECT 1'),
                    toolResult: null,
                    approvalDecision: 'rejected',
                },
            ],
            false,
        );

        expect(content(msgs[1])[0]).toEqual({
            type: 'tool-approval-response',
            approvalId: 'sql-approval:tc1',
            approved: false,
        });
    });

    it('a completed approved call emits request + response + result', () => {
        const msgs = AiAgentService.buildToolCallTurnMessages(
            [
                {
                    toolCall: call('tc1', 'SELECT 1'),
                    toolResult: result('tc1', '3 rows'),
                    approvalDecision: 'approved',
                },
            ],
            false,
        );

        expect(msgs).toHaveLength(3);
        expect(content(msgs[1])[0].type).toBe('tool-approval-response');
        expect(content(msgs[2])[0].type).toBe('tool-result');
    });

    it('a PRIOR approved call whose result was never persisted backfills a synthetic tool-result (no dangling call)', () => {
        const msgs = AiAgentService.buildToolCallTurnMessages(
            [
                {
                    toolCall: call('tc1', 'SELECT 1'),
                    toolResult: null,
                    approvalDecision: 'approved',
                },
            ],
            false,
        );

        expect(msgs).toHaveLength(3);
        expect(content(msgs[0])[0].type).toBe('tool-call');
        expect(content(msgs[1])[0].type).toBe('tool-approval-response');
        expect(content(msgs[2])[0]).toMatchObject({
            type: 'tool-result',
            toolCallId: 'tc1',
            output: { type: 'json', value: 'Tool result unavailable.' },
        });
    });

    it('hasUnresolvedSqlApproval is true only for a decided, result-less call', () => {
        expect(
            AiAgentService.hasUnresolvedSqlApproval([
                {
                    toolCall: call('tc1', 'x'),
                    toolResult: null,
                    approvalDecision: 'approved',
                },
            ]),
        ).toBe(true);

        expect(
            AiAgentService.hasUnresolvedSqlApproval([
                {
                    toolCall: call('tc1', 'x'),
                    toolResult: result('tc1', 'y'),
                    approvalDecision: 'approved',
                },
            ]),
        ).toBe(false);

        expect(
            AiAgentService.hasUnresolvedSqlApproval([
                {
                    toolCall: call('tc1', 'x'),
                    toolResult: null,
                    approvalDecision: null,
                },
            ]),
        ).toBe(false);
    });
});
