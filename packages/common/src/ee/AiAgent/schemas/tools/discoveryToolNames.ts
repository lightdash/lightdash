import { type ToolRuntime } from '../defineTool';

/**
 * Tool descriptions reference a small set of tools by runtime-specific name.
 * The agent and MCP runtimes expose the same tools under different names, so a
 * description must use the current runtime's name or it points at a tool that
 * does not exist. Keep these names explicit and shared with toolDefinitions.ts.
 */
export const CROSS_REFERENCED_TOOL_NAMES = {
    grepFields: { agent: 'grepFields', mcp: 'grep_fields' },
    getMetadata: { agent: 'getMetadata', mcp: 'get_metadata' },
    findContent: { agent: 'findContent', mcp: 'find_content' },
    visualization: { agent: 'generateVisualization', mcp: 'run_metric_query' },
} as const satisfies Record<string, Record<ToolRuntime, string>>;

export type CrossReferencedTool = keyof typeof CROSS_REFERENCED_TOOL_NAMES;

export const toolNameFor = (
    tool: CrossReferencedTool,
    runtime: ToolRuntime,
): string => CROSS_REFERENCED_TOOL_NAMES[tool][runtime];
