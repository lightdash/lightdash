import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { withRollingCacheBreakpoint } from './promptCache';

const hasBreakpoint = (message: ModelMessage) =>
    !!message.providerOptions?.anthropic?.cacheControl &&
    !!message.providerOptions?.bedrock?.cachePoint;

const system: ModelMessage = {
    role: 'system',
    content: 'system',
    providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
        bedrock: { cachePoint: { type: 'default' } },
    },
};

describe('withRollingCacheBreakpoint', () => {
    it('marks only the last message and keeps the system breakpoint', () => {
        const messages = withRollingCacheBreakpoint([
            system,
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ]);

        expect(messages.map(hasBreakpoint)).toEqual([true, false, true]);
    });

    it('moves the previous step breakpoint forward', () => {
        const firstStep = withRollingCacheBreakpoint([
            system,
            { role: 'user', content: 'hi' },
        ]);
        const secondStep = withRollingCacheBreakpoint([
            ...firstStep,
            { role: 'assistant', content: 'hello' },
            { role: 'user', content: 'again' },
        ]);

        expect(secondStep.map(hasBreakpoint)).toEqual([
            true,
            false,
            false,
            true,
        ]);
    });

    it('keeps other provider options when removing a breakpoint', () => {
        const [first] = withRollingCacheBreakpoint([
            {
                role: 'user',
                content: 'hi',
                providerOptions: {
                    anthropic: {
                        cacheControl: { type: 'ephemeral' },
                        other: true,
                    },
                },
            },
            { role: 'user', content: 'again' },
        ]);

        expect(first.providerOptions?.anthropic).toEqual({ other: true });
    });
});
