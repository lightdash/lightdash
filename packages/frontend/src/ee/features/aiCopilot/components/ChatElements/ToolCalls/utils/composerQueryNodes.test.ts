import { type AiAgentToolResult } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getComposerFailureMessage } from './composerQueryNodes';

const toolResult = (
    result: string,
    status: string,
    toolName = 'runComposerQueries',
) =>
    ({
        uuid: 'result',
        promptUuid: 'prompt',
        toolCallId: 'call',
        createdAt: new Date(),
        toolType: 'built-in',
        toolName,
        result,
        metadata: { status },
    }) as AiAgentToolResult;

describe('getComposerFailureMessage', () => {
    it('extracts the fenced error of a failed call', () => {
        const traceback =
            'Composer query failed on node(s): "sim" (run() raised:\nTraceback (most recent call last):\nZeroDivisionError: division by zero)';
        expect(
            getComposerFailureMessage(
                toolResult(
                    `Error running composer queries.\n\n\`\`\`\n${traceback}\n\`\`\`\n\nTry again if you believe the error can be resolved.`,
                    'error',
                ),
            ),
        ).toBe(traceback);
    });

    it('falls back to the whole result without a fenced block', () => {
        expect(
            getComposerFailureMessage(
                toolResult('Duplicate node id(s) in submission: a.', 'error'),
            ),
        ).toBe('Duplicate node id(s) in submission: a.');
    });

    it('ignores successful, rejected and other tool results', () => {
        expect(getComposerFailureMessage(undefined)).toBeNull();
        expect(
            getComposerFailureMessage(
                toolResult('Composer query complete.', 'success'),
            ),
        ).toBeNull();
        expect(
            getComposerFailureMessage(toolResult('User rejected.', 'rejected')),
        ).toBeNull();
        expect(
            getComposerFailureMessage(toolResult('boom', 'error', 'runSql')),
        ).toBeNull();
    });
});
