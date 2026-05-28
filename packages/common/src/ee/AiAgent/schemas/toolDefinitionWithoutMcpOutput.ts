import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import {
    type AgentToolView,
    type McpToolConfigWithoutOutput,
    type McpToolViewWithoutOutput,
    type ToolDescription,
    type ToolRuntime,
} from './defineTool';
import { assertAvailable, resolveDescription } from './toolDefinitionUtils';

export class ToolDefinitionWithoutMcpOutputImpl<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
> {
    readonly name: TName;

    readonly title: string;

    readonly availability: readonly ToolRuntime[];

    readonly inputSchema: TInput;

    readonly inputSchemaTransformed: TInputTransformed;

    private readonly descriptionConfig: ToolDescription;

    private readonly mcpConfig: McpToolConfigWithoutOutput | null;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        availability: readonly ToolRuntime[];
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        mcpConfig: McpToolConfigWithoutOutput | null;
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
    for(runtime: 'mcp'): McpToolViewWithoutOutput<TName, TInput>;
    for(
        runtime: ToolRuntime,
    ): AgentToolView<TName, TInput> | McpToolViewWithoutOutput<TName, TInput> {
        assertAvailable(this.name, this.availability, runtime);

        if (runtime === 'agent') {
            return {
                name: this.name,
                title: this.title,
                description: this.description,
                inputSchema: this.inputSchema,
            };
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
        };
    }
}
