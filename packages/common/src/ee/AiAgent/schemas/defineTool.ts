import { type z } from 'zod';
import {
    ToolDefinitionWithMcpOutputImpl,
    ToolDefinitionWithoutMcpOutputImpl,
} from './toolDefinition';

export type ToolRuntime = 'agent' | 'mcp';

export type ToolDescription = string | ((runtimeName: string) => string);

export type McpToolAnnotations = {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

type McpOutputSchema = z.ZodObject<z.ZodRawShape>;

type McpToolConfigBase = {
    name?: string;
    annotations: McpToolAnnotations;
    meta?: Record<string, unknown>;
};

export type McpToolConfigWithoutOutput = McpToolConfigBase & {
    outputSchema?: undefined;
};

export type McpToolConfigWithOutput<TOutputSchema extends McpOutputSchema> =
    McpToolConfigBase & {
        outputSchema: TOutputSchema;
    };

export type McpToolConfig =
    | McpToolConfigWithoutOutput
    | McpToolConfigWithOutput<McpOutputSchema>;

export type AgentToolView<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = {
    name: TName;
    title: string;
    description: string;
    inputSchema: TInput;
};

type McpToolViewBase<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = {
    name: string;
    canonicalName: TName;
    title: string;
    description: string;
    inputSchema: TInput;
    annotations: McpToolAnnotations;
    meta: Record<string, unknown> | undefined;
};

export type McpToolViewWithoutOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = McpToolViewBase<TName, TInput>;

export type McpToolViewWithOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TOutputSchema extends McpOutputSchema,
> = McpToolViewBase<TName, TInput> & {
    outputSchema: TOutputSchema;
};

export type ToolDefinitionWithoutMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
> = {
    readonly name: TName;
    readonly title: string;
    readonly availability: readonly ToolRuntime[];
    readonly inputSchema: TInput;
    readonly inputSchemaTransformed: TInputTransformed;
    readonly description: string;
    for(runtime: 'agent'): AgentToolView<TName, TInput>;
    for(runtime: 'mcp'): McpToolViewWithoutOutput<TName, TInput>;
};

export type ToolDefinitionWithMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TOutputSchema extends McpOutputSchema,
> = {
    readonly name: TName;
    readonly title: string;
    readonly availability: readonly ToolRuntime[];
    readonly inputSchema: TInput;
    readonly inputSchemaTransformed: TInputTransformed;
    readonly description: string;
    for(runtime: 'agent'): AgentToolView<TName, TInput>;
    for(runtime: 'mcp'): McpToolViewWithOutput<TName, TInput, TOutputSchema>;
};

export type ToolDefinition<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
> =
    | ToolDefinitionWithoutMcpOutput<TName, TInput, TInputTransformed>
    | ToolDefinitionWithMcpOutput<
          TName,
          TInput,
          TInputTransformed,
          McpOutputSchema
      >;

export type ToolDefinitionInstance = ToolDefinition<
    string,
    z.ZodObject<z.ZodRawShape>,
    z.ZodTypeAny
>;

export type ToolInput<T extends ToolDefinitionInstance> = z.infer<
    T['inputSchema']
>;

export type ToolInputTransformed<T extends ToolDefinitionInstance> = z.infer<
    T['inputSchemaTransformed']
>;

type ToolDefinitionArgsBase<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
> = {
    name: TName;
    title: string;
    description: ToolDescription;
    availability: readonly ToolRuntime[];
    inputSchema: TInput;
    inputSchemaTransformed?: TInputTransformed;
};

type ToolDefinitionArgsWithoutMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
> = ToolDefinitionArgsBase<TName, TInput, TInputTransformed> & {
    mcp?: McpToolConfigWithoutOutput;
};

type ToolDefinitionArgsWithMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TOutputSchema extends McpOutputSchema,
> = ToolDefinitionArgsBase<TName, TInput, TInputTransformed> & {
    mcp: McpToolConfigWithOutput<TOutputSchema>;
};

const validateToolDefinition = (args: {
    name: string;
    availability: readonly ToolRuntime[];
    mcp?: McpToolConfig;
}): void => {
    if (args.availability.length === 0) {
        throw new Error(`Tool "${args.name}" must be available somewhere`);
    }
    if (new Set(args.availability).size !== args.availability.length) {
        throw new Error(`Tool "${args.name}" has duplicate runtimes`);
    }
    if (args.availability.includes('mcp') && !args.mcp?.annotations) {
        throw new Error(
            `Tool "${args.name}" is MCP-available but has no annotations`,
        );
    }
};

export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
    TOutputSchema extends McpOutputSchema = McpOutputSchema,
>(
    def: ToolDefinitionArgsWithMcpOutput<
        TName,
        TInput,
        TInputTransformed,
        TOutputSchema
    >,
): ToolDefinitionWithMcpOutput<TName, TInput, TInputTransformed, TOutputSchema>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
>(
    def: ToolDefinitionArgsWithoutMcpOutput<TName, TInput, TInputTransformed>,
): ToolDefinitionWithoutMcpOutput<TName, TInput, TInputTransformed>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    def:
        | ToolDefinitionArgsWithoutMcpOutput<TName, TInput, z.ZodTypeAny>
        | ToolDefinitionArgsWithMcpOutput<
              TName,
              TInput,
              z.ZodTypeAny,
              McpOutputSchema
          >,
):
    | ToolDefinitionWithoutMcpOutput<TName, TInput, z.ZodTypeAny>
    | ToolDefinitionWithMcpOutput<
          TName,
          TInput,
          z.ZodTypeAny,
          McpOutputSchema
      > {
    validateToolDefinition(def);

    const inputSchemaTransformed =
        def.inputSchemaTransformed ?? def.inputSchema;

    if (def.mcp?.outputSchema) {
        return new ToolDefinitionWithMcpOutputImpl({
            name: def.name,
            title: def.title,
            description: def.description,
            availability: def.availability,
            inputSchema: def.inputSchema,
            inputSchemaTransformed,
            mcpConfig: def.mcp,
        });
    }

    return new ToolDefinitionWithoutMcpOutputImpl({
        name: def.name,
        title: def.title,
        description: def.description,
        availability: def.availability,
        inputSchema: def.inputSchema,
        inputSchemaTransformed,
        mcpConfig: def.mcp ?? null,
    });
}
