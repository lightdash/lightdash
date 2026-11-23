import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { withOrderedContentWrites } from './orderedContentWrites';

const sleep = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

describe('withOrderedContentWrites', () => {
    it('runs dashboard and chart writes in call order even when earlier ones are slower', async () => {
        const done: string[] = [];
        const tools = withOrderedContentWrites({
            createContent: {
                execute: async (input: { type: string; slug: string }) => {
                    await sleep(input.type === 'dashboard' ? 30 : 1);
                    done.push(input.slug);
                    return input.slug;
                },
            },
        } as unknown as ToolSet);
        const execute = tools.createContent.execute as (
            input: unknown,
            options: unknown,
        ) => Promise<unknown>;
        await Promise.all([
            execute({ type: 'dashboard', slug: 'd' }, {}),
            execute({ type: 'chart', slug: 'c1' }, {}),
            execute({ type: 'chart', slug: 'c2' }, {}),
        ]);
        expect(done).toEqual(['d', 'c1', 'c2']);
    });

    it('keeps going after a failed write', async () => {
        const tools = withOrderedContentWrites({
            editContent: {
                execute: async (input: { type: string; fail: boolean }) => {
                    if (input.fail) throw new Error('boom');
                    return 'ok';
                },
            },
        } as unknown as ToolSet);
        const execute = tools.editContent.execute as (
            input: unknown,
            options: unknown,
        ) => Promise<unknown>;
        await expect(
            execute({ type: 'chart', fail: true }, {}),
        ).rejects.toThrow('boom');
        await expect(execute({ type: 'chart', fail: false }, {})).resolves.toBe(
            'ok',
        );
    });
});
