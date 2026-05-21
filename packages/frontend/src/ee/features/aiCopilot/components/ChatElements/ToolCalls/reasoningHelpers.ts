import { type AiAgentReasoning } from '@lightdash/common';

export type StreamingReasoning = { reasoningId: string; parts: string[] };

export const toReasoningTexts = (
    persisted: AiAgentReasoning[] | undefined,
    streaming: StreamingReasoning[] | undefined,
): string[] => {
    if (streaming && streaming.length > 0) {
        return streaming
            .map((r) => r.parts.join('\n\n'))
            .filter((t) => t.length > 0);
    }
    if (persisted && persisted.length > 0) {
        return persisted.map((r) => r.text).filter((t) => t.length > 0);
    }
    return [];
};
