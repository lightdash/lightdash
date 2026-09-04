import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { toJsonSchema, toLlmJsonSchema } from '../../../utils/zodJsonSchema';
import { defineTool } from './defineTool';
import {
    FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION,
    FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
} from './filterExpressions';
import {
    agentToolNames,
    findContentToolDefinition,
    generateVisualizationFilterExpressionToolDefinition,
    generateVisualizationToolDefinition,
    mcpToolDefinitions,
    runQueryFilterExpressionToolDefinition,
    runQueryToolDefinition,
    searchFieldValuesFilterExpressionToolDefinition,
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

    it('keeps rollout-only filter expression definitions out of stable default arrays', () => {
        expect(
            mcpToolDefinitions.includes(runQueryFilterExpressionToolDefinition),
        ).toBe(false);
        expect(
            generateVisualizationFilterExpressionToolDefinition.for('agent')
                .name,
        ).toBe('generateVisualization');
        expect(
            mcpToolDefinitions.includes(
                searchFieldValuesFilterExpressionToolDefinition,
            ),
        ).toBe(false);
        expect(
            searchFieldValuesFilterExpressionToolDefinition.for('agent').name,
        ).toBe('searchFieldValues');
        expect(runQueryFilterExpressionToolDefinition.for('mcp').name).toBe(
            'run_metric_query',
        );
    });

    it('points expression tools to runtime-owned guidance without embedding the grammar', () => {
        const agentDescriptions = [
            generateVisualizationFilterExpressionToolDefinition.for('agent')
                .description,
            runQueryFilterExpressionToolDefinition.for('agent').description,
            searchFieldValuesFilterExpressionToolDefinition.for('agent')
                .description,
        ];
        const mcpDescriptions = [
            runQueryFilterExpressionToolDefinition.for('mcp').description,
            searchFieldValuesFilterExpressionToolDefinition.for('mcp')
                .description,
        ];

        agentDescriptions.forEach((description) => {
            expect(description).toContain('the Agent system prompt');
        });
        mcpDescriptions.forEach((description) => {
            expect(description).toContain('`InitializeResult.instructions`');
        });
        [...agentDescriptions, ...mcpDescriptions].forEach((description) => {
            expect(description).not.toContain(
                FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
            );
            expect(description).not.toContain(
                FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION,
            );
        });
    });

    it('keeps compact query contracts within size and token budgets', () => {
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
                inputSchema: toJsonSchema(view.inputSchema, { io: 'input' }),
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
        const measurementKeys = [
            'bytes',
            'cl100kTokens',
            'o200kTokens',
        ] satisfies (keyof ReturnType<typeof measure>)[];
        const expectWithinBudget = (
            measurement: ReturnType<typeof measure>,
            budget: ReturnType<typeof measure>,
        ) => {
            measurementKeys.forEach((key) => {
                expect(measurement[key]).toBeLessThanOrEqual(budget[key]);
            });
        };
        const expectAtMostRatio = (
            expression: ReturnType<typeof measure>,
            legacy: ReturnType<typeof measure>,
            maximumRatio: number,
        ) => {
            measurementKeys.forEach((key) => {
                expect(expression[key] / legacy[key]).toBeLessThanOrEqual(
                    maximumRatio,
                );
            });
        };

        expect(contracts.agentExpression).not.toContain('fieldFilterType');
        expect(contracts.mcpExpression).not.toContain('fieldFilterType');

        const measurements = {
            agentLegacy: measure(contracts.agentLegacy),
            agentExpression: measure(contracts.agentExpression),
            mcpLegacy: measure(contracts.mcpLegacy),
            mcpExpression: measure(contracts.mcpExpression),
        };
        expectWithinBudget(measurements.agentExpression, {
            bytes: 25_000,
            cl100kTokens: 5_500,
            o200kTokens: 5_600,
        });
        expectWithinBudget(measurements.mcpExpression, {
            bytes: 20_000,
            cl100kTokens: 4_500,
            o200kTokens: 4_600,
        });
        // Preserve at least a 44% agent reduction and a 60% Model Context
        // Protocol (MCP) reduction across bytes and both tokenizers.
        expectAtMostRatio(
            measurements.agentExpression,
            measurements.agentLegacy,
            0.56,
        );
        expectAtMostRatio(
            measurements.mcpExpression,
            measurements.mcpLegacy,
            0.4,
        );
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
            toLlmJsonSchema(inputSchema, { reused: 'ref' }),
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
        expect(
            JSON.stringify(toJsonSchema(mcpInputSchema, { io: 'input' })),
        ).not.toContain('"$ref"');
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
