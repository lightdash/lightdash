import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import {
    type AgentToolConfig,
    type AgentToolView,
    type McpToolConfigWithoutOutput,
    type McpToolViewWithoutOutput,
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

export class ToolDefinitionWithoutMcpOutputImpl<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends z.ZodTypeAny | undefined,
> {
    readonly name: TName;

    readonly title: string;

    readonly availability: readonly ToolRuntime[];

    readonly inputSchema: TInput;

    readonly inputSchemaTransformed: TInputTransformed;

    private readonly descriptionConfig: ToolDescription;

    private readonly agentConfig: AgentToolConfig<TAgentOutputSchema> | null;

    private readonly mcpConfig: McpToolConfigWithoutOutput | null;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        availability: readonly ToolRuntime[];
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        agentConfig: AgentToolConfig<TAgentOutputSchema> | null;
        mcpConfig: McpToolConfigWithoutOutput | null;
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

    for(runtime: 'agent'): AgentToolView<TName, TInput, TAgentOutputSchema>;
    for(runtime: 'mcp'): McpToolViewWithoutOutput<TName, TInput>;
    for(
        runtime: ToolRuntime,
    ):
        | AgentToolView<TName, TInput, TAgentOutputSchema>
        | McpToolViewWithoutOutput<TName, TInput> {
        assertAvailable(this.name, this.availability, runtime);

        if (runtime === 'agent') {
            return this.buildAgentView();
        }

        if (this.mcpConfig === null) {
            throw new Error(`Tool "${this.name}" is missing MCP config`);
        }

        const mcpName = this.mcpConfig.name ?? snakeCase(this.name);
        return {
            name: mcpName,
            canonicalName: this.name,
            title: this.title,
            description: resolveDescription(this.descriptionConfig, mcpName),
            inputSchema: this.inputSchema,
            annotations: this.mcpConfig.annotations,
            meta: this.mcpConfig.meta,
            result: createMcpToolResultBuilders(),
        };
    }
}
