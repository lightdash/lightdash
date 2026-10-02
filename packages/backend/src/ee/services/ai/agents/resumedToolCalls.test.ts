import type { ModelMessage } from 'ai';
import { getResumedToolCalls } from './resumedToolCalls';

const halted = (toolCallId: string): ModelMessage => ({
    role: 'assistant',
    content: [
        {
            type: 'tool-call',
            toolCallId,
            toolName: 'generateUi',
            input: { title: toolCallId },
        },
        {
            type: 'tool-approval-request',
            approvalId: `approval:${toolCallId}`,
            toolCallId,
        },
    ],
});

const response = (toolCallId: string, approved: boolean) => ({
    type: 'tool-approval-response' as const,
    approvalId: `approval:${toolCallId}`,
    approved,
});

describe('getResumedToolCalls', () => {
    it('returns approved and denied calls answered in the trailing tool message', () => {
        expect(
            getResumedToolCalls([
                { role: 'user', content: 'Move the charts' },
                halted('tc-1'),
                halted('tc-2'),
                {
                    role: 'tool',
                    content: [response('tc-1', true), response('tc-2', false)],
                },
            ]),
        ).toEqual([
            {
                toolCallId: 'tc-1',
                toolName: 'generateUi',
                input: { title: 'tc-1' },
            },
            {
                toolCallId: 'tc-2',
                toolName: 'generateUi',
                input: { title: 'tc-2' },
            },
        ]);
    });

    it('skips an approved call that already has a result', () => {
        expect(
            getResumedToolCalls([
                halted('tc-1'),
                {
                    role: 'tool',
                    content: [
                        response('tc-1', true),
                        {
                            type: 'tool-result',
                            toolCallId: 'tc-1',
                            toolName: 'generateUi',
                            output: { type: 'text', value: 'done' },
                        },
                    ],
                },
            ]),
        ).toEqual([]);
    });

    it('keeps a denied call whose result is the denial, as the SDK re-emits it', () => {
        expect(
            getResumedToolCalls([
                halted('tc-1'),
                {
                    role: 'tool',
                    content: [
                        response('tc-1', false),
                        {
                            type: 'tool-result',
                            toolCallId: 'tc-1',
                            toolName: 'generateUi',
                            output: { type: 'execution-denied' },
                        },
                    ],
                },
            ]),
        ).toHaveLength(1);
    });

    it('returns nothing when the history does not end with a tool message', () => {
        expect(
            getResumedToolCalls([
                halted('tc-1'),
                { role: 'tool', content: [response('tc-1', true)] },
                { role: 'user', content: 'Anything else?' },
            ]),
        ).toEqual([]);
    });

    it('ignores a response without a matching request or call', () => {
        expect(
            getResumedToolCalls([
                { role: 'user', content: 'Move the charts' },
                { role: 'tool', content: [response('tc-unknown', true)] },
            ]),
        ).toEqual([]);
    });
});
