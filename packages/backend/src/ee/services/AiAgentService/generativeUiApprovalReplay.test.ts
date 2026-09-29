import { moveChartsSpecMock } from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { AiAgentService } from './AiAgentService';

type Row = Parameters<
    typeof AiAgentService.buildToolCallTurnMessages
>[0][number];

const generateUiCall: Row['toolCall'] = {
    uuid: 'tool-call-row-1',
    promptUuid: 'prompt-1',
    toolCallId: 'tc-ui',
    parentToolCallId: null,
    createdAt: new Date('2026-09-29T00:00:00Z'),
    toolArgs: moveChartsSpecMock,
    toolType: 'built-in',
    toolName: 'generateUi',
};

// The join reports a recorded card outcome as an approval with no result yet.
const awaitingResume: Row = {
    toolCall: generateUiCall,
    toolResult: null,
    approvalDecision: 'approved',
};

describe('generateUi approval replay', () => {
    it('ends the resumed prompt with the approval response the SDK executes', () => {
        const history = AiAgentService.backfillDanglingToolResults([
            { role: 'user', content: 'Move the revenue charts to Finance' },
            ...AiAgentService.buildToolCallTurnMessages([awaitingResume], true),
        ]);

        expect(history.slice(1)).toEqual([
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'tc-ui',
                        toolName: 'generateUi',
                        input: moveChartsSpecMock,
                    },
                    {
                        type: 'tool-approval-request',
                        approvalId: 'sql-approval:tc-ui',
                        toolCallId: 'tc-ui',
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-approval-response',
                        approvalId: 'sql-approval:tc-ui',
                        approved: true,
                    },
                ],
            },
        ]);
        expect(AiAgentService.hasUnresolvedSqlApproval([awaitingResume])).toBe(
            true,
        );
    });

    it('backfills a card that was never resumed on an earlier prompt', () => {
        const history = AiAgentService.buildToolCallTurnMessages(
            [awaitingResume],
            false,
        );

        expect(history.at(-1)).toEqual({
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'tc-ui',
                    toolName: 'generateUi',
                    output: { type: 'json', value: 'Tool result unavailable.' },
                },
            ],
        });
    });
});
