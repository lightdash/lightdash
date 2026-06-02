import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import {
    type AgentToolConfig,
    type AgentToolView,
    type McpToolConfigWithoutOutput,
    type McpToolViewWithoutOutput,
    type ToolDescription,
    type ToolRuntime,
    type ToolRuntimeOptions,
} from './defineTool';
import {
    assertAvailable,
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

    private readonly descriptionVarsSchema: z.ZodType<unknown> | null;

    private readonly agentConfig: AgentToolConfig<TAgentOutputSchema> | null;

    private readonly mcpConfig: McpToolConfigWithoutOutput | null;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        descriptionVarsSchema: z.ZodType<unknown> | null;
        availability: readonly ToolRuntime[];
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        agentConfig: AgentToolConfig<TAgentOutputSchema> | null;
        mcpConfig: McpToolConfigWithoutOutput | null;
    }) {
        this.name = args.name;
        this.title = args.title;
        this.descriptionConfig = args.description;
        this.descriptionVarsSchema = args.descriptionVarsSchema;
        this.availability = args.availability;
        this.inputSchema = args.inputSchema;
        this.inputSchemaTransformed = args.inputSchemaTransformed;
        this.agentConfig = args.agentConfig;
        this.mcpConfig = args.mcpConfig;
    }

    get description(): string {
        return this.resolveDescription('agent', this.name);
    }

    private resolveDescription(
        runtime: ToolRuntime,
        runtimeName: string,
        options?: ToolRuntimeOptions,
    ): string {
        return resolveDescription({
            canonicalName: this.name,
            description: this.descriptionConfig,
            descriptionVarsSchema: this.descriptionVarsSchema,
            options,
            runtime,
            runtimeName,
        });
    }

    private buildAgentView(
        options?: ToolRuntimeOptions,
    ): AgentToolView<TName, TInput, TAgentOutputSchema> {
        const base = {
            name: this.name,
            title: this.title,
            description: this.resolveDescription('agent', this.name, options),
            inputSchema: this.inputSchema,
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

    runtimeName(runtime: ToolRuntime): string {
        assertAvailable(this.name, this.availability, runtime);
        if (runtime === 'agent') {
            return this.name;
        }
        if (this.mcpConfig === null) {
            throw new Error(`Tool "${this.name}" is missing MCP config`);
        }
        return this.mcpConfig.name ?? snakeCase(this.name);
    }

    for(
        runtime: 'agent',
        options?: ToolRuntimeOptions,
    ): AgentToolView<TName, TInput, TAgentOutputSchema>;
    for(
        runtime: 'mcp',
        options?: ToolRuntimeOptions,
    ): McpToolViewWithoutOutput<TName, TInput>;
    for(
        runtime: ToolRuntime,
        options?: ToolRuntimeOptions,
    ):
        | AgentToolView<TName, TInput, TAgentOutputSchema>
        | McpToolViewWithoutOutput<TName, TInput> {
        assertAvailable(this.name, this.availability, runtime);

        if (runtime === 'agent') {
            return this.buildAgentView(options);
        }

        if (this.mcpConfig === null) {
            throw new Error(`Tool "${this.name}" is missing MCP config`);
        }

        const mcpName = this.runtimeName('mcp');
        return {
            name: mcpName,
            canonicalName: this.name,
            title: this.title,
            description: this.resolveDescription('mcp', mcpName, options),
            inputSchema: this.inputSchema,
            annotations: this.mcpConfig.annotations,
            meta: this.mcpConfig.meta,
            result: createMcpToolResultBuilders(),
        };
    }
}
