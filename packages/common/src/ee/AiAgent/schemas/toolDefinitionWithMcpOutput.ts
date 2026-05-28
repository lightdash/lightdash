import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import {
    type AgentToolView,
    type McpToolConfigWithOutput,
    type McpToolViewWithOutput,
    type ToolDescription,
    type ToolRuntime,
} from './defineTool';
import { assertAvailable, resolveDescription } from './toolDefinitionUtils';

export class ToolDefinitionWithMcpOutputImpl<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TOutputSchema extends z.ZodObject<z.ZodRawShape>,
> {
    readonly name: TName;

    readonly title: string;

    readonly availability: readonly ToolRuntime[];

    readonly inputSchema: TInput;

    readonly inputSchemaTransformed: TInputTransformed;

    private readonly descriptionConfig: ToolDescription;

    private readonly mcpConfig: McpToolConfigWithOutput<TOutputSchema>;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        availability: readonly ToolRuntime[];
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        mcpConfig: McpToolConfigWithOutput<TOutputSchema>;
    }) {
        this.name = args.name;
        this.title = args.title;
        this.descriptionConfig = args.description;
        this.availability = args.availability;
        this.inputSchema = args.inputSchema;
        this.inputSchemaTransformed = args.inputSchemaTransformed;
        this.mcpConfig = args.mcpConfig;
    }

    get description(): string {
        return resolveDescription(this.descriptionConfig, this.name);
    }

    for(runtime: 'agent'): AgentToolView<TName, TInput>;
    for(runtime: 'mcp'): McpToolViewWithOutput<TName, TInput, TOutputSchema>;
    for(
        runtime: ToolRuntime,
    ):
        | AgentToolView<TName, TInput>
        | McpToolViewWithOutput<TName, TInput, TOutputSchema> {
        assertAvailable(this.name, this.availability, runtime);

        if (runtime === 'agent') {
            return {
                name: this.name,
                title: this.title,
                description: this.description,
                inputSchema: this.inputSchema,
            };
        }

        const mcpName = this.mcpConfig.name ?? snakeCase(this.name);
        return {
            name: mcpName,
            canonicalName: this.name,
            title: this.title,
            description: resolveDescription(this.descriptionConfig, mcpName),
            inputSchema: this.inputSchema,
            annotations: this.mcpConfig.annotations,
            outputSchema: this.mcpConfig.outputSchema,
            meta: this.mcpConfig.meta,
        };
    }
}
