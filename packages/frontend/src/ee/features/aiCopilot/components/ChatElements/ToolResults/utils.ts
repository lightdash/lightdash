import type { AiAgentToolResult } from '@lightdash/common';
import {
    isToolFindExploresResult,
    isToolFindFieldsResult,
} from '@lightdash/common';

type NarrowedBy<G> = G extends ((
    result: AiAgentToolResult,
) => result is AiAgentToolResult & (infer R))
    ? AiAgentToolResult & R
    : never;

// Derived from the guards so it cannot drift from them. Stored rows carry no
// structuredContent, so this is deliberately not the tools' output type.
export type ParsedToolResult =
    | NarrowedBy<typeof isToolFindFieldsResult>
    | NarrowedBy<typeof isToolFindExploresResult>
    | null;

export const parseToolResultMetadata = (
    toolResult: AiAgentToolResult | undefined,
    toolName: string,
): ParsedToolResult => {
    if (!toolResult) {
        return null;
    }

    if (toolName === 'findFields' && isToolFindFieldsResult(toolResult)) {
        return toolResult;
    }

    if (toolName === 'findExplores' && isToolFindExploresResult(toolResult)) {
        return toolResult;
    }

    return null;
};
