import type { ModelMessage } from 'ai';

type ProviderOptions = NonNullable<ModelMessage['providerOptions']>;

const BREAKPOINT: ProviderOptions = {
    anthropic: { cacheControl: { type: 'ephemeral' } },
    bedrock: { cachePoint: { type: 'default' } },
};

const withBreakpoint = (message: ModelMessage): ModelMessage => ({
    ...message,
    providerOptions: {
        ...message.providerOptions,
        anthropic: {
            ...message.providerOptions?.anthropic,
            ...BREAKPOINT.anthropic,
        },
        bedrock: { ...message.providerOptions?.bedrock, ...BREAKPOINT.bedrock },
    },
});

const withoutBreakpoint = (message: ModelMessage): ModelMessage => {
    const options = message.providerOptions;
    if (!options?.anthropic?.cacheControl && !options?.bedrock?.cachePoint)
        return message;
    const { cacheControl, ...anthropic } = options.anthropic ?? {};
    const { cachePoint, ...bedrock } = options.bedrock ?? {};
    return {
        ...message,
        providerOptions: { ...options, anthropic, bedrock },
    };
};

/**
 * Breakpoints on the last message and `pinnedIndex` only: AI SDK carries prepared messages into
 * the next step and Anthropic allows 4 breakpoints. System messages keep their own.
 */
export const withRollingCacheBreakpoint = (
    messages: ModelMessage[],
    pinnedIndex: number | null = null,
): ModelMessage[] =>
    messages.map((message, index) => {
        if (index === messages.length - 1 || index === pinnedIndex)
            return withBreakpoint(message);
        return message.role === 'system' ? message : withoutBreakpoint(message);
    });
