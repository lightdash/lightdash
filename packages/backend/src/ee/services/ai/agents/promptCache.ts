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
 * Moves the conversation cache breakpoint to the last message, so each step reads the
 * history the previous step wrote. AI SDK carries prepared messages into the next step,
 * so earlier markers are removed to stay under Anthropic's 4-breakpoint cap.
 * System messages keep their own breakpoint.
 */
export const withRollingCacheBreakpoint = (
    messages: ModelMessage[],
): ModelMessage[] =>
    messages.map((message, index) => {
        if (index === messages.length - 1) return withBreakpoint(message);
        return message.role === 'system' ? message : withoutBreakpoint(message);
    });
