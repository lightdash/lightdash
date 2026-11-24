import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { withOrderedContentWrites } from './orderedContentWrites';

type Execute = (input: unknown, options: unknown) => Promise<unknown>;

describe('withOrderedContentWrites', () => {
    it('starts a chart write only after the dashboard write called before it finishes', async () => {
        let finishDashboard = () => {};
        const started: string[] = [];
        const tools = withOrderedContentWrites({
            createContent: {
                execute: (input: { type: string; slug: string }) => {
                    started.push(input.slug);
                    return input.type === 'dashboard'
                        ? new Promise<void>((resolve) => {
                              finishDashboard = resolve;
                          })
                        : Promise.resolve();
                },
            },
        } as unknown as ToolSet);
        const execute = tools.createContent.execute as Execute;

        const writes = Promise.all([
            execute({ type: 'dashboard', slug: 'd' }, {}),
            execute({ type: 'chart', slug: 'c1' }, {}),
            execute({ type: 'chart', slug: 'c2' }, {}),
        ]);
        await Promise.resolve();
        expect(started).toEqual(['d']);

        finishDashboard();
        await writes;
        expect(started).toEqual(['d', 'c1', 'c2']);
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
        const execute = tools.editContent.execute as Execute;
        await expect(
            execute({ type: 'chart', fail: true }, {}),
        ).rejects.toThrow('boom');
        await expect(execute({ type: 'chart', fail: false }, {})).resolves.toBe(
            'ok',
        );
    });
});
