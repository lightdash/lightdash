import {
    hashStringToBase36,
    toolGenerateHashesOutputSchema,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGenerateHashes } from './generateHashes';

vi.mock('@lightdash/common', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lightdash/common')>();
    return {
        ...actual,
        hashStringToBase36: vi.fn(actual.hashStringToBase36),
    };
});

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const execute = async (inputs: string[]) => {
    const tool = getGenerateHashes();
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    const output = await tool.execute(
        { inputs },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Unexpected streamed output');
    }
    return output;
};

describe('getGenerateHashes', () => {
    beforeEach(() => {
        vi.mocked(hashStringToBase36).mockClear();
    });

    it('returns the hashes as text and as structured content', async () => {
        const output = await execute(['orders', 'customers']);

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            hashes: ['orders', 'customers'].map(hashStringToBase36),
        });
        expect(JSON.parse(output.result)).toEqual(output.structuredContent);
        expect(toolGenerateHashesOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors the error text in structured content when hashing fails', async () => {
        vi.mocked(hashStringToBase36).mockImplementationOnce(() => {
            throw new Error('boom');
        });

        const output = await execute(['orders']);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error generating hashes.');
        expect(output.result).toContain('boom');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolGenerateHashesOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
