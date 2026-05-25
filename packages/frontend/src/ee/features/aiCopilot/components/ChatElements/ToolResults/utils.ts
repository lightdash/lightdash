import {
    findExploresTool,
    findFieldsTool,
    type AiAgentToolResult,
    type ToolOutput,
} from '@lightdash/common';

type ToolFindFieldsOutput = ToolOutput<typeof findFieldsTool>;
type ToolFindExploresOutput = ToolOutput<typeof findExploresTool>;

export const parseToolResultMetadata = (
    toolResult: AiAgentToolResult | undefined,
    toolName: string,
): ToolFindFieldsOutput | ToolFindExploresOutput | null => {
    if (!toolResult?.metadata) {
        return null;
    }

    if (toolName === 'findFields') {
        const result = findFieldsTool
            .for('agent')
            .outputSchema.safeParse(toolResult);
        return result.success ? result.data : null;
    }

    if (toolName === 'findExplores') {
        const result = findExploresTool
            .for('agent')
            .outputSchema.safeParse(toolResult);
        return result.success ? result.data : null;
    }

    return null;
};
