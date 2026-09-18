import {
    ForbiddenError,
    toolUpdateUserNameOutputSchema,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { UpdateUserNameFn } from '../types/aiAgentDependencies';
import { getUpdateUserName } from './updateUserName';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const run = async (
    updateUserName: UpdateUserNameFn,
    args: { firstName: string; lastName: string },
) => {
    const tool = getUpdateUserName({ updateUserName });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    const output = await tool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Unexpected streaming output');
    }
    return output;
};

describe('updateUserName tool', () => {
    it('returns the saved name as text and structured content', async () => {
        const updateUserName = vi
            .fn<UpdateUserNameFn>()
            .mockResolvedValue(undefined);

        const output = await run(updateUserName, {
            firstName: '  Jane ',
            lastName: ' Doe ',
        });

        expect(updateUserName).toHaveBeenCalledWith({
            firstName: 'Jane',
            lastName: 'Doe',
        });
        expect(output).toEqual({
            result: 'User name updated to "Jane Doe".',
            metadata: { status: 'success', fullName: 'Jane Doe' },
            structuredContent: { fullName: 'Jane Doe' },
        });
        expect(toolUpdateUserNameOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors the error text into structured content on failure', async () => {
        const updateUserName = vi
            .fn<UpdateUserNameFn>()
            .mockRejectedValue(new ForbiddenError('Not allowed'));

        const output = await run(updateUserName, {
            firstName: 'Jane',
            lastName: 'Doe',
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error updating user name.');
        expect(output.result).toContain('Not allowed');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolUpdateUserNameOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
