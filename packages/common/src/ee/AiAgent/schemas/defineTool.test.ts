import { z } from 'zod';
import { defineTool } from './defineTool';
import {
    agentToolNames,
    generateVisualizationToolDefinition,
    mcpToolDefinitions,
    runQueryToolDefinition,
} from './tools';
import { ToolNameSchema } from './visualizations';

describe('defineTool', () => {
    it('builds separate agent and MCP runtime views', () => {
        const agentView = generateVisualizationToolDefinition.for('agent');
        const mcpView = runQueryToolDefinition.for('mcp');

        expect(agentView.name).toBe('generateVisualization');
        expect(mcpView.name).toBe('run_metric_query');
        expect(mcpView.canonicalName).toBe('runQuery');
        expect(mcpView.outputSchema).toBeDefined();
    });

    it('builds spreadable agent views with output schemas', () => {
        const outputSchema = z.object({
            result: z.string(),
            metadata: z.object({ status: z.enum(['success', 'error']) }),
        });
        const tool = defineTool({
            name: 'sampleAgentTool',
            title: 'Sample agent tool',
            description: 'Sample',
            availability: ['agent'],
            inputSchema: z.object({}),
            agent: { outputSchema },
        });

        const agentView = tool.for('agent');
        expect(agentView.outputSchema).toBe(outputSchema);
        expect(
            agentView.toModelOutput({
                output: {
                    result: 'Nope',
                    metadata: { status: 'error' },
                },
            }),
        ).toEqual({ type: 'error-text', value: 'Nope' });
    });

    it('wraps agent input schemas with JSON Schema references', () => {
        const sharedSchema = z.object({ value: z.string() });
        const inputSchema = z.object({
            first: sharedSchema,
            second: sharedSchema,
        });
        const tool = defineTool({
            name: 'referencedSchemaTool',
            title: 'Referenced schema tool',
            description: 'Sample',
            availability: ['agent', 'mcp'],
            inputSchema,
            mcp: {
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
            },
        });

        expect(
            JSON.stringify(tool.for('agent').inputSchema.jsonSchema),
        ).toContain('"$ref"');
        expect(tool.for('mcp').inputSchema).toBe(inputSchema);
    });

    it('builds MCP result helpers', () => {
        const outputSchema = z.object({ count: z.number() });
        const tool = defineTool({
            name: 'sampleMcpTool',
            title: 'Sample MCP tool',
            description: 'Sample',
            availability: ['mcp'],
            inputSchema: z.object({}),
            mcp: {
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
                structuredContentSchema: outputSchema,
            },
        });

        const mcpView = tool.for('mcp');
        expect(mcpView.outputSchema).toBe(outputSchema);
        expect(mcpView.result.text('Done')).toEqual({
            content: [{ type: 'text', text: 'Done' }],
        });
        expect(mcpView.result.error('Bad')).toEqual({
            isError: true,
            content: [{ type: 'text', text: 'Bad' }],
        });
        expect(mcpView.result.structured('Counted', { count: 1 })).toEqual({
            content: [{ type: 'text', text: 'Counted' }],
            structuredContent: { count: 1 },
        });
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
            'get_query_result',
            'list_skills',
            'read_skill',
            'read_skill_resource',
            'render_chart',
            'route_agent',
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
