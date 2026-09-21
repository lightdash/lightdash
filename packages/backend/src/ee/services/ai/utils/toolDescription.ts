import type { ToolSet } from 'ai';

// AI SDK 7 lets a tool description be a function of its tool context.
// Lightdash and MCP tools declare static strings; anything else reads as absent.
export const getStaticToolDescription = (
    tool: Pick<ToolSet[string], 'description'>,
): string | undefined =>
    typeof tool.description === 'string' ? tool.description : undefined;
