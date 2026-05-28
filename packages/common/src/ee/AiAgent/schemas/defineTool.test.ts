import { z } from 'zod';
import { defineTool } from './defineTool';
import {
    agentToolNames,
    mcpToolDefinitions,
    runQueryToolDefinition,
} from './tools';
import { ToolNameSchema } from './visualizations';

describe('defineTool', () => {
    it('builds separate agent and MCP runtime views', () => {
        const agentView = runQueryToolDefinition.for('agent');
        const mcpView = runQueryToolDefinition.for('mcp');

        expect(agentView.name).toBe('runQuery');
        expect(mcpView.name).toBe('run_metric_query');
        expect(mcpView.canonicalName).toBe('runQuery');
        expect(mcpView.outputSchema).toBeDefined();
    });

    it('resolves descriptions with the runtime-specific name', () => {
        const tool = defineTool({
            name: 'sampleTool',
            title: 'Sample tool',
            description: (name) => `Call ${name}`,
            availability: ['agent', 'mcp'],
            inputSchema: z.object({}),
            mcp: {
                name: 'sample_tool',
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
            },
        });

        expect(tool.for('agent').description).toBe('Call sampleTool');
        expect(tool.for('mcp').description).toBe('Call sample_tool');
    });

    it('rejects inconsistent availability config', () => {
        expect(() =>
            defineTool({
                name: 'badMcpTool',
                title: 'Bad MCP tool',
                description: 'Bad',
                availability: ['mcp'],
                inputSchema: z.object({}),
            }),
        ).toThrow('MCP-available');

        expect(() =>
            defineTool({
                name: 'duplicateRuntimeTool',
                title: 'Duplicate runtime tool',
                description: 'Bad',
                availability: ['agent', 'agent'],
                inputSchema: z.object({}),
            }),
        ).toThrow('duplicate runtimes');
    });

    it('keeps MCP structured output schemas limited to current structured tools', () => {
        const structuredMcpToolNames = mcpToolDefinitions
            .map((tool) => tool.for('mcp'))
            .filter((tool) => 'outputSchema' in tool)
            .map((tool) => tool.name)
            .sort();

        expect(structuredMcpToolNames).toEqual([
            'run_ai_writeback',
            'run_metric_query',
            'run_sql',
        ]);
    });

    it('keeps ToolNameSchema aligned with agent-available definitions', () => {
        expect(new Set(ToolNameSchema.options)).toEqual(
            new Set(agentToolNames),
        );
    });
});
