import { toolGenerateUuidsOutputSchema } from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGenerateUuids } from './generateUuids';

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

const executeGenerateUuids = async (count: number) => {
    const { execute } = getGenerateUuids();
    if (!execute) throw new Error('generateUuids tool has no execute');
    const output = await execute({ count }, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('generateUuids tool streams its output');
    }
    return output;
};

describe('generateUuids', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the generated uuids as text and as structured content', async () => {
        const output = await executeGenerateUuids(3);

        expect(toolGenerateUuidsOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'success' });
        if ('error' in output.structuredContent) {
            throw new Error(
                `unexpected error: ${output.structuredContent.error}`,
            );
        }

        const { uuids } = output.structuredContent;
        expect(uuids).toHaveLength(3);
        uuids.forEach((uuid) =>
            expect(uuid).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            ),
        );
        expect(JSON.parse(output.result)).toEqual({ uuids });
    });

    it('mirrors the error text in structured content when generation fails', async () => {
        vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
            throw new Error('entropy exhausted');
        });

        const output = await executeGenerateUuids(1);

        expect(toolGenerateUuidsOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error generating UUIDs.');
        expect(output.result).toContain('entropy exhausted');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
