import { type AiAgentToolResult } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    isToolCallFailed,
    isToolCallSettled,
    isToolCallUnapproved,
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

describe('isToolCallFailed', () => {
    it('reads a persisted error result', () => {
        expect(
            isToolCallFailed(call, [persistedResult('error', 'Timeout')]),
        ).toBe(true);
    });

    it('treats unapproved SQL as neither a failure nor a success', () => {
        const live = (status: string): ToolCallSummary => ({
            ...call,
            isPreliminary: false,
            toolOutput: { result: `Approval ${status}`, metadata: { status } },
        });
        for (const status of ['rejected', 'timeout']) {
            expect(isToolCallFailed(live(status))).toBe(false);
            expect(isToolCallUnapproved(live(status))).toBe(true);
        }
    });

    it('ignores successful results', () => {
        expect(isToolCallFailed(call, [persistedResult('success', 'ok')])).toBe(
            false,
        );
    });

    it('reads a final live error output but not a preliminary one', () => {
        const output = { result: 'Bad SQL', metadata: { status: 'error' } };
        expect(
            isToolCallFailed({
                ...call,
                toolOutput: output,
                isPreliminary: false,
            }),
        ).toBe(true);
        expect(
            isToolCallFailed({
                ...call,
                toolOutput: output,
                isPreliminary: true,
            }),
        ).toBe(false);
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
