import snakeCase from 'lodash/snakeCase';
import { type ToolRuntime } from '../defineTool';
import { type ToolName } from '../visualizations';

/**
 * The discovery/query tools reference each other by name in their prose
 * descriptions, and the agent and MCP runtimes expose the same tools under
 * different names — so a description must use the names of the runtime it is
 * rendered for, or it points the model at a tool that does not exist.
 *
 * The MCP name is the framework's own rule, `snakeCase(canonicalName)` (see
 * `toolDefinitionWith[out]McpOutput`), so we reuse it rather than hardcode a
 * second copy. The exceptions are definitions whose `mcp.name` diverges from
 * that rule.
 */
const MCP_NAME_OVERRIDES: Record<string, string> = {
    generateVisualization: 'render_chart',
    runQuery: 'run_metric_query',
};

export const toolNameFor = (
    canonicalName: ToolName,
    runtime: ToolRuntime,
): string => {
    if (runtime === 'agent') return canonicalName;
    return MCP_NAME_OVERRIDES[canonicalName] ?? snakeCase(canonicalName);
};
