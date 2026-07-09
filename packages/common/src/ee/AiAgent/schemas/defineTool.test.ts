import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
    defineTool,
    type AgentToModelOutput,
    type ToolOutput,
} from './defineTool';
import { appendMcpText } from './toolDefinitionUtils';
import {
    agentToolNames,
    buildToolOutputSchema,
    findContentToolDefinition,
    generateVisualizationToolDefinition,
    getMetadataToolDefinition,
    grepFieldsToolDefinition,
    mcpToolDefinitions,
    runQueryToolDefinition,
} from './tools';
import { CROSS_REFERENCED_TOOL_NAMES } from './tools/discoveryToolNames';
import { ToolNameSchema } from './visualizations';

const structuredContentSchema = z.object({ count: z.number() });

const outputSchema = buildToolOutputSchema();
const outputSchemaWithStructuredContent = buildToolOutputSchema(
    structuredContentSchema,
);

const toModelOutput: AgentToModelOutput<ToolOutput> = ({ output }) => {
    const items = Array.isArray(output) ? output : [output];
    const isError = items.some((item) => item.status === 'error');
    return {
        type: isError ? 'error-text' : 'text',
        value: items
            .map((item) =>
                item.status === 'error' ? item.error : String(item.result),
            )
            .join('\n'),
    };
};

const mcpAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
};

describe('defineTool', () => {
    it('builds separate agent and MCP runtime views', () => {
        const agentView = generateVisualizationToolDefinition.for('ai-sdk');
        const mcpView = runQueryToolDefinition.for('mcp');

        expect(generateVisualizationToolDefinition.name).toBe(
            'generateVisualization',
        );
        expect(agentView.outputSchema).toBeDefined();
        expect(mcpView.name).toBe('run_metric_query');
        expect(mcpView.canonicalName).toBe('runQuery');
        expect(mcpView.outputSchema).toBeDefined();
    });

    it('builds AI SDK tools with output schemas', () => {
        const tool = defineTool({
            name: 'sampleAgentTool',
            title: 'Sample agent tool',
            description: 'Sample',
            availability: {
                runtime: 'agent',
                agent: { toModelOutput },
            },
            inputSchema: z.object({}),
            outputSchema,
        });

        const agentView = tool.for('ai-sdk');
        expect(agentView.outputSchema).toBe(outputSchema);
        expect(
            agentView.toModelOutput({
                toolCallId: 'tool-call-1',
                input: {},
                output: {
                    status: 'error',
                    error: 'Nope',
                },
            }),
        ).toEqual({ type: 'error-text', value: 'Nope' });

        const builtTool = agentView.build({
            description: 'Overridden description',
            needsApproval: true,
            execute: async () => ({
                status: 'success',
                type: 'string',
                result: 'Done',
            }),
        });

        expect(builtTool.description).toBe('Overridden description');
        expect(builtTool.needsApproval).toBe(true);
        expect(builtTool.outputSchema).toBe(outputSchema);
        expect(builtTool.execute).toBeDefined();
    });

    it('defaults toModelOutput when no agent config is provided', () => {
        const tool = defineTool({
            name: 'defaultedAgentTool',
            title: 'Defaulted agent tool',
            description: 'Sample',
            availability: { runtime: 'agent' },
            inputSchema: z.object({}),
            outputSchema,
        });

        const agentView = tool.for('ai-sdk');
        expect(
            agentView.toModelOutput({
                toolCallId: 'tool-call-1',
                input: {},
                output: { status: 'error', error: 'Nope' },
            }),
        ).toEqual({ type: 'error-text', value: 'Nope' });
        expect(
            agentView.toModelOutput({
                toolCallId: 'tool-call-2',
                input: {},
                output: {
                    status: 'success',
                    type: 'json',
                    result: { count: 1 },
                },
            }),
        ).toEqual({
            type: 'text',
            value: JSON.stringify({ count: 1 }, null, 2),
        });
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
            availability: {
                runtime: 'both',
                agent: { toModelOutput },
                mcp: {
                    name: 'referenced_schema_tool',
                    annotations: mcpAnnotations,
                },
            },
            inputSchema,
            outputSchema,
        });

        const agentInputSchema = tool.for('ai-sdk').inputSchema;
        if (
            !('jsonSchema' in agentInputSchema) ||
            !('validate' in agentInputSchema)
        ) {
            throw new Error('Expected ai-sdk input schema wrapper');
        }

        expect(agentInputSchema.jsonSchema).toEqual(
            zodToJsonSchema(inputSchema, {
                $refStrategy: 'root',
                target: 'jsonSchema7',
            }),
        );
        expect(agentInputSchema.validate?.(input)).toEqual({
            success: true,
            value: input,
        });
        expect(
            agentInputSchema.validate?.({
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
        const tool = defineTool({
            name: 'sampleMcpTool',
            title: 'Sample MCP tool',
            description: 'Sample',
            availability: {
                runtime: 'mcp',
                mcp: {
                    name: 'sample_mcp_tool',
                    annotations: mcpAnnotations,
                },
            },
            inputSchema: z.object({}),
            outputSchema: outputSchemaWithStructuredContent,
        });

        const mcpView = tool.for('mcp');
        expect(mcpView.outputSchema).toBe(structuredContentSchema);
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
        expect(
            appendMcpText(
                mcpView.result.structured('Counted', { count: 1 }),
                'Extra',
            ),
        ).toEqual({
            content: [
                { type: 'text', text: 'Counted' },
                { type: 'text', text: 'Extra' },
            ],
            structuredContent: { count: 1 },
        });
    });

    it('omits the MCP output schema when the tool has no structured content', () => {
        const tool = defineTool({
            name: 'textOnlyMcpTool',
            title: 'Text-only MCP tool',
            description: 'Sample',
            availability: {
                runtime: 'mcp',
                mcp: {
                    name: 'text_only_mcp_tool',
                    annotations: mcpAnnotations,
                },
            },
            inputSchema: z.object({}),
            outputSchema,
        });

        expect(tool.for('mcp').outputSchema).toBeUndefined();
    });

    it('resolves descriptions with the runtime-specific name', () => {
        const tool = defineTool({
            name: 'sampleTool',
            title: 'Sample tool',
            description: ({ toolName }) => `Call ${toolName}`,
            availability: {
                runtime: 'both',
                agent: { toModelOutput },
                mcp: {
                    name: 'sample_tool',
                    annotations: mcpAnnotations,
                },
            },
            inputSchema: z.object({}),
            outputSchema,
        });

        expect(tool.for('ai-sdk').description).toBe('Call sampleTool');
        expect(tool.for('mcp').description).toBe('Call sample_tool');
    });

    it('advertises MCP output schemas exactly for the structured-content tools', () => {
        const structuredMcpToolNames = mcpToolDefinitions
            .map((tool) => tool.for('mcp'))
            .filter((tool) => tool.outputSchema !== undefined)
            .map((tool) => tool.name)
            .sort();

        expect(structuredMcpToolNames).toEqual([
            'find_explores',
            'find_fields',
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

    it('keeps cross-referenced tool names aligned with declarations', () => {
        expect(grepFieldsToolDefinition.name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.grepFields.agent,
        );
        expect(grepFieldsToolDefinition.for('mcp').name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.grepFields.mcp,
        );
        expect(getMetadataToolDefinition.name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.getMetadata.agent,
        );
        expect(getMetadataToolDefinition.for('mcp').name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.getMetadata.mcp,
        );
        expect(findContentToolDefinition.name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.findContent.agent,
        );
        expect(findContentToolDefinition.for('mcp').name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.findContent.mcp,
        );
        expect(generateVisualizationToolDefinition.name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.visualization.agent,
        );
        expect(runQueryToolDefinition.for('mcp').name).toBe(
            CROSS_REFERENCED_TOOL_NAMES.visualization.mcp,
        );
    });

    it('keeps ToolNameSchema aligned with agent-available definitions', () => {
        expect(new Set(ToolNameSchema.options)).toEqual(
            new Set(agentToolNames),
        );
    });
});
