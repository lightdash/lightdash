import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildReadLibraries } from './readLibraries';

const grepFields = (
    execute: (input: { query: string; limit: number }) => unknown,
) =>
    tool({
        description: 'Find fields.',
        inputSchema: z.object({
            query: z.string(),
            limit: z.number().default(10),
        }),
        execute: async (input) => execute(input),
    });

describe('buildReadLibraries', () => {
    it('offers only the tools the agent has, under their library names', () => {
        const libraries = buildReadLibraries((name) =>
            name === 'grepFields' ? grepFields(() => null) : null,
        );
        expect(Object.keys(libraries)).toEqual(['layer']);
        expect(Object.keys(libraries.layer)).toEqual(['fields']);
    });

    it('validates arguments with defaults and returns the text the model would read', async () => {
        const execute = vi.fn().mockReturnValue({
            result: 'orders.amount',
            metadata: { status: 'success' },
            structuredContent: {},
        });
        const { layer } = buildReadLibraries((name) =>
            name === 'grepFields' ? grepFields(execute) : null,
        );
        await expect(layer.fields.run({ query: 'amount' })).resolves.toBe(
            'orders.amount',
        );
        expect(execute).toHaveBeenCalledWith({ query: 'amount', limit: 10 });
        await expect(layer.fields.run({})).rejects.toThrow('layer.fields');
    });

    it('throws what a failed tool would have told the model', async () => {
        const { layer } = buildReadLibraries((name) =>
            name === 'grepFields'
                ? grepFields(() => ({
                      result: 'You cannot see this explore.',
                      metadata: { status: 'error' },
                      structuredContent: { error: 'x' },
                  }))
                : null,
        );
        await expect(layer.fields.run({ query: 'a' })).rejects.toThrow(
            'You cannot see this explore.',
        );
    });
});
