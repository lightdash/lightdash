import snakeCase from 'lodash/snakeCase';
import { type ToolRuntime } from '../defineTool';

/**
 * The discovery/query tools reference each other by name in their prose
 * descriptions, and the agent and MCP runtimes expose the same tools under
 * different names — so a description must use the names of the runtime it is
 * rendered for, or it points the model at a tool that does not exist.
 *
 * The MCP name is the framework's own rule, `snakeCase(canonicalName)` (see
 * `toolDefinitionWith[out]McpOutput`), so we reuse it rather than hardcode a
 * second copy. The one exception is the chart tool: `generateVisualization` on
 * the agent, `render_chart` on MCP.
 */
export const toolNameFor = (
    canonicalName: string,
    runtime: ToolRuntime,
): string => {
    if (runtime === 'agent') return canonicalName;
    return canonicalName === 'generateVisualization'
        ? 'render_chart'
        : snakeCase(canonicalName);
};
