import type { ModelMessage } from 'ai';

/**
 * Claude Sonnet 5.5 rejects `tool_choice` type `tool` and `any` with a 400.
 * `auto` and `none` are still accepted.
 * @ref https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
 */
export const rejectsForcedToolChoice = (modelId: string | undefined): boolean =>
    modelId?.includes('claude-sonnet-5-5') ?? false;

const isForcedToolChoice = (
    toolChoice: unknown,
): toolChoice is { type: 'tool' | 'any'; toolName?: string } =>
    !!toolChoice &&
    typeof toolChoice === 'object' &&
    'type' in toolChoice &&
    (toolChoice.type === 'tool' || toolChoice.type === 'any');

/** Instruction that replaces a forced tool choice Sonnet 5.5 would reject. */
export const forcedToolChoiceNudge = (
    toolChoice: unknown,
    modelId: string | undefined,
): string | null => {
    if (!rejectsForcedToolChoice(modelId) || !isForcedToolChoice(toolChoice)) {
        return null;
    }
    return typeof toolChoice.toolName === 'string'
        ? `You must call the ${toolChoice.toolName} tool on this step.`
        : 'You must call one of the available tools on this step.';
};

export const omitRejectedToolChoice = <T extends { toolChoice?: unknown }>(
    step: T,
    modelId: string | undefined,
): T => {
    if (!forcedToolChoiceNudge(step.toolChoice, modelId)) return step;
    const { toolChoice: _dropped, ...rest } = step;
    return rest as T;
};

export const withForcedToolNudge = (
    messages: ModelMessage[],
    toolChoice: unknown,
    modelId: string | undefined,
): ModelMessage[] => {
    const nudge = forcedToolChoiceNudge(toolChoice, modelId);
    if (!nudge) return messages;
    return [...messages, { role: 'user', content: nudge }];
};
