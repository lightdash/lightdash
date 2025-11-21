import type {
    AiAgentToolResult,
    ToolFindExploresOutput,
    ToolFindFieldsOutput,
} from '@lightdash/common';
import {
    toolFindExploresOutputSchema,
    toolFindFieldsOutputSchema,
} from '@lightdash/common';

export const parseToolResultMetadata = (
    toolResult: AiAgentToolResult | undefined,
    toolName: string,
): ToolFindFieldsOutput | ToolFindExploresOutput | null => {
    if (!toolResult?.metadata) {
        return null;
    }

    if (toolName === 'findFields') {
        const result = toolFindFieldsOutputSchema.safeParse(toolResult);
        return result.success ? result.data : null;
    }

    if (toolName === 'findExplores') {
        const result = toolFindExploresOutputSchema.safeParse(toolResult);
        return result.success ? result.data : null;
    }

    return null;
};
