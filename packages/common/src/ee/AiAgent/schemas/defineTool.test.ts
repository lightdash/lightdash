import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defineTool } from './defineTool';
import { FILTER_EXPRESSION_GRAMMAR_DESCRIPTION } from './filterExpressions';
import {
    agentToolNames,
    findContentToolDefinition,
    generateVisualizationFilterExpressionToolDefinition,
    generateVisualizationToolDefinition,
    mcpToolDefinitions,
    runQueryFilterExpressionToolDefinition,
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

    it('keeps runtime-selected filter expression definitions out of default arrays', () => {
        expect(
            mcpToolDefinitions.includes(runQueryFilterExpressionToolDefinition),
        ).toBe(false);
        expect(
            generateVisualizationFilterExpressionToolDefinition.for('agent')
                .name,
        ).toBe('generateVisualization');
        expect(runQueryFilterExpressionToolDefinition.for('mcp').name).toBe(
            'run_metric_query',
        );
    });

    it('snapshots compact query contracts and tokenizer counts', () => {
        const agentLegacy = generateVisualizationToolDefinition.for('agent');
        const agentExpression =
            generateVisualizationFilterExpressionToolDefinition.for('agent');
        const mcpLegacy = runQueryToolDefinition.for('mcp');
        const mcpExpression = runQueryFilterExpressionToolDefinition.for('mcp');
        const serializeAgent = (
            view: typeof agentLegacy | typeof agentExpression,
        ) =>
            JSON.stringify({
                description: view.description,
                inputSchema: view.inputSchema.jsonSchema,
            });
        const serializeMcp = (view: typeof mcpLegacy | typeof mcpExpression) =>
            JSON.stringify({
                description: view.description,
                inputSchema: zodToJsonSchema(view.inputSchema),
            });
        const contracts = {
            agentLegacy: serializeAgent(agentLegacy),
            agentExpression: serializeAgent(agentExpression),
            mcpLegacy: serializeMcp(mcpLegacy),
            mcpExpression: serializeMcp(mcpExpression),
        };
        const cl100k = getEncoding('cl100k_base');
        const o200k = getEncoding('o200k_base');
        const measure = (contract: string) => ({
            bytes: new TextEncoder().encode(contract).length,
            cl100kTokens: cl100k.encode(contract).length,
            o200kTokens: o200k.encode(contract).length,
        });

        expect(contracts.agentExpression).not.toContain('fieldFilterType');
        expect(contracts.mcpExpression).not.toContain('fieldFilterType');
        expect(
            mcpExpression.description.split(
                FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
            ),
        ).toHaveLength(2);
        expect({
            agentLegacy: measure(contracts.agentLegacy),
            agentExpression: measure(contracts.agentExpression),
            mcpLegacy: measure(contracts.mcpLegacy),
            mcpExpression: measure(contracts.mcpExpression),
        }).toMatchInlineSnapshot(`
          {
            "agentExpression": {
              "bytes": 20835,
              "cl100kTokens": 4608,
              "o200kTokens": 4682,
            },
            "agentLegacy": {
              "bytes": 42556,
              "cl100kTokens": 10240,
              "o200kTokens": 10444,
            },
            "mcpExpression": {
              "bytes": 27096,
              "cl100kTokens": 5991,
              "o200kTokens": 6104,
            },
            "mcpLegacy": {
              "bytes": 90074,
              "cl100kTokens": 21125,
              "o200kTokens": 21616,
            },
          }
        `);
    });

    it('uses runtime-available dashboard detail tools', () => {
        expect(findContentToolDefinition.for('agent').description).toContain(
            'readContent',
        );
        expect(
            findContentToolDefinition.for('agent').description,
        ).not.toContain('getDashboardCharts');
        expect(findContentToolDefinition.for('mcp').description).toContain(
            'read_content',
        );
        expect(findContentToolDefinition.for('mcp').description).not.toContain(
            'getDashboardCharts',
        );
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

    it('builds agent validation and keeps MCP input schemas ref-free', () => {
        const sharedSchema = z.object({ value: z.string() });
        const input = {
            first: { value: 'one' },
            second: { value: 'two' },
        };
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
                    openWorldHint: false,
                },
            },
        });

        const agentInputSchema = tool.for('agent').inputSchema;
        const { jsonSchema, validate } = agentInputSchema;
        expect(jsonSchema).toEqual(
            zodToJsonSchema(inputSchema, {
                $refStrategy: 'root',
                target: 'jsonSchema7',
            }),
        );
        expect(validate?.(input)).toEqual({
            success: true,
            value: input,
        });
        expect(
            validate?.({
                first: { value: 1 },
                second: { value: 'two' },
            }),
        ).toMatchObject({ success: false });

        const mcpInputSchema = tool.for('mcp').inputSchema;
        expect(mcpInputSchema).not.toBe(inputSchema);
        expect(JSON.stringify(zodToJsonSchema(mcpInputSchema))).not.toContain(
            '"$ref"',
        );
        expect(mcpInputSchema.parse(input)).toEqual(input);
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
                    openWorldHint: false,
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
            description: ({ toolName }) => `Call ${toolName}`,
            availability: ['agent', 'mcp'],
            inputSchema: z.object({}),
            mcp: {
                name: 'sample_tool',
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false,
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

    it('keeps MCP structured output schemas aligned with current structured tools', () => {
        const structuredMcpToolNames = mcpToolDefinitions
            .map((tool) => tool.for('mcp'))
            .filter((tool) => 'outputSchema' in tool)
            .map((tool) => tool.name)
            .sort();

        expect(structuredMcpToolNames).toEqual([
            'generate_hashes',
            'get_ai_writeback_status',
            'get_context',
            'get_metadata',
            'get_query_result',
            'grep_fields',
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
