import { ToolDefinitions } from './toolNames';

describe('ToolDefinitions', () => {
    it('derives tool names by context', () => {
        const agentTools = ToolDefinitions.for('agent');
        const mcpTools = ToolDefinitions.for('mcp');

        // @ts-expect-error runMetricQuery is MCP-only
        expect(agentTools.runMetricQuery).toBeUndefined();
        // @ts-expect-error generateDashboard is agent-only
        expect(mcpTools.generateDashboard).toBeUndefined();

        expect(agentTools.findExplores.name).toBe('findExplores');
        expect(mcpTools.findExplores.name).toBe('find_explores');
        expect(mcpTools.runSql.name).toBe('run_sql');
    });

    it('keeps titles stable across contexts', () => {
        const agentTools = ToolDefinitions.for('agent');
        const mcpTools = ToolDefinitions.for('mcp');

        expect(agentTools.findExplores.title).toBe('Find Explores');
        expect(mcpTools.findExplores.title).toBe('Find Explores');
    });

    it('derives schema descriptions from bound tool metadata', () => {
        const agentTools = ToolDefinitions.for('agent');
        const mcpTools = ToolDefinitions.for('mcp');

        expect(agentTools.findExplores.description).toContain(
            'Tool: findExplores',
        );
        expect(mcpTools.findExplores.description).toContain(
            'Tool: find_explores',
        );
    });
});
