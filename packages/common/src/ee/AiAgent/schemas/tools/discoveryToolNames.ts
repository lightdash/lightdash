import snakeCase from 'lodash/snakeCase';
import { type ToolRuntime } from '../defineTool';
import { type ToolName } from '../visualizations';

// Descriptions must name sibling tools as the runtime exposes them: MCP uses the
// framework's `snakeCase(canonicalName)`, except generateVisualization → render_chart.
export const toolNameFor = (
    canonicalName: ToolName,
    runtime: ToolRuntime,
): string => {
    if (runtime === 'agent') return canonicalName;
    return canonicalName === 'generateVisualization'
        ? 'render_chart'
        : snakeCase(canonicalName);
};
