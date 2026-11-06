import { type AiAgentToolResult } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatToolErrorMessage,
    getToolCallFailure,
    isToolCallSettled,
} from './toolCallFailure';
import { type ToolCallSummary } from './types';

const call: ToolCallSummary = {
    toolCallId: 'call-1',
    toolName: 'runSql',
    toolArgs: { sql: 'select 1' },
};

const persistedResult = (
    status: 'success' | 'error',
    result: string,
): AiAgentToolResult => {
    const base = {
        uuid: 'result-1',
        promptUuid: 'prompt-1',
        createdAt: new Date(),
        toolCallId: 'call-1',
        toolType: 'built-in' as const,
        toolName: 'runSql' as const,
        result,
    };
    return status === 'success'
        ? { ...base, metadata: { status: 'success' } }
        : { ...base, metadata: { status: 'error' } };
};

describe('formatToolErrorMessage', () => {
    it('prefers the fenced error over the wrapper text', () => {
        expect(
            formatToolErrorMessage(
                'Error running composer queries.\n\n```\nrelation "marketing.ad_spend" does not exist\n```\n\nTry again if you believe the error can be resolved.',
            ),
        ).toBe('relation "marketing.ad_spend" does not exist');
    });

    it('drops the retry hint and markdown from plain errors', () => {
        expect(
            formatToolErrorMessage(
                'Column **amount** not found. Try again if you believe the error can be resolved.',
            ),
        ).toBe('Column amount not found.');
    });
});

describe('getToolCallFailure', () => {
    it('reads a persisted error result', () => {
        expect(
            getToolCallFailure(call, [persistedResult('error', 'Timeout')]),
        ).toEqual({ toolCallId: 'call-1', message: 'Timeout' });
    });

    it('treats timed-out and rejected SQL as failures', () => {
        const live = (status: string): ToolCallSummary => ({
            ...call,
            isPreliminary: false,
            toolOutput: { result: `Approval ${status}`, metadata: { status } },
        });
        expect(getToolCallFailure(live('timeout'))?.message).toBe(
            'Approval timeout',
        );
        expect(getToolCallFailure(live('rejected'))?.message).toBe(
            'Approval rejected',
        );
    });

    it('ignores successful results', () => {
        expect(
            getToolCallFailure(call, [persistedResult('success', 'ok')]),
        ).toBeNull();
    });

    it('reads a final live error output but not a preliminary one', () => {
        const output = { result: 'Bad SQL', metadata: { status: 'error' } };
        expect(
            getToolCallFailure({
                ...call,
                toolOutput: output,
                isPreliminary: false,
            }),
        ).toEqual({ toolCallId: 'call-1', message: 'Bad SQL' });
        expect(
            getToolCallFailure({
                ...call,
                toolOutput: output,
                isPreliminary: true,
            }),
        ).toBeNull();
    });
});

describe('isToolCallSettled', () => {
    it('is false while the call has no final output', () => {
        expect(isToolCallSettled(call)).toBe(false);
        expect(
            isToolCallSettled({ ...call, toolOutput: {}, isPreliminary: true }),
        ).toBe(false);
    });

    it('is true once a final output or persisted result exists', () => {
        expect(
            isToolCallSettled({
                ...call,
                toolOutput: {},
                isPreliminary: false,
            }),
        ).toBe(true);
        expect(isToolCallSettled(call, [persistedResult('success', '')])).toBe(
            true,
        );
    });
});
