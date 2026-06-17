import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import {
    type AgentToolConfig,
    type AgentToolView,
    type McpOutputSchema,
    type McpToolConfigWithOutput,
    type McpToolViewWithOutput,
    type ToolDescription,
    type ToolRuntime,
} from './defineTool';
import {
    assertAvailable,
    createAgentInputSchema,
    createMcpToolResultBuilders,
    defaultAgentToModelOutput,
    resolveDescription,
} from './toolDefinitionUtils';

export class ToolDefinitionWithMcpOutputImpl<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends z.ZodTypeAny | undefined,
    TOutputSchema extends McpOutputSchema,
> {
    readonly name: TName;

    readonly title: string;

    readonly availability: readonly ToolRuntime[];

    readonly inputSchema: TInput;

    readonly inputSchemaTransformed: TInputTransformed;

    private readonly descriptionConfig: ToolDescription;

    private readonly agentConfig: AgentToolConfig<TAgentOutputSchema> | null;

    private readonly mcpConfig: McpToolConfigWithOutput<TOutputSchema>;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        availability: readonly ToolRuntime[];
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        agentConfig: AgentToolConfig<TAgentOutputSchema> | null;
        mcpConfig: McpToolConfigWithOutput<TOutputSchema>;
    }) {
        this.name = args.name;
        this.title = args.title;
        this.descriptionConfig = args.description;
        this.availability = args.availability;
        this.inputSchema = args.inputSchema;
        this.inputSchemaTransformed = args.inputSchemaTransformed;
        this.agentConfig = args.agentConfig;
        this.mcpConfig = args.mcpConfig;
    }

    get description(): string {
        return resolveDescription(this.descriptionConfig, this.name);
    }

    private buildAgentView(): AgentToolView<TName, TInput, TAgentOutputSchema> {
        const base = {
            name: this.name,
            title: this.title,
            description: this.description,
            inputSchema: createAgentInputSchema(this.inputSchema),
            toModelOutput:
                this.agentConfig?.toModelOutput ?? defaultAgentToModelOutput,
        };

        if (this.agentConfig?.outputSchema) {
            return {
                ...base,
                outputSchema: this.agentConfig.outputSchema,
            };
        }

        return base;
    }

    private get outputSchema(): TOutputSchema {
        return this.mcpConfig.structuredContentSchema;
    }

    for(runtime: 'agent'): AgentToolView<TName, TInput, TAgentOutputSchema>;
    for(runtime: 'mcp'): McpToolViewWithOutput<TName, TInput, TOutputSchema>;
    for(
        runtime: ToolRuntime,
    ):
        | AgentToolView<TName, TInput, TAgentOutputSchema>
        | McpToolViewWithOutput<TName, TInput, TOutputSchema> {
        assertAvailable(this.name, this.availability, runtime);

        if (runtime === 'agent') {
            return this.buildAgentView();
        }

        const mcpName = this.mcpConfig.name ?? snakeCase(this.name);
        return {
            name: mcpName,
            canonicalName: this.name,
            title: this.title,
            description: resolveDescription(this.descriptionConfig, mcpName),
            inputSchema: this.inputSchema,
            annotations: this.mcpConfig.annotations,
            outputSchema: this.outputSchema,
            meta: this.mcpConfig.meta,
            result: createMcpToolResultBuilders<z.infer<TOutputSchema>>(),
        };
    }
}
