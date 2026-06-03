import { type z } from 'zod';
import {
    ToolDefinitionWithMcpOutputImpl,
    ToolDefinitionWithoutMcpOutputImpl,
} from './toolDefinition';

export type ToolRuntime = 'agent' | 'mcp';

export type ToolDescriptionContext = {
    runtime: ToolRuntime;
    canonicalName: string;
    vars: unknown;
};

export type ToolDescription =
    | string
    | ((runtimeName: string, context: ToolDescriptionContext) => string);

export type ToolRuntimeOptions = {
    descriptionVars?: unknown;
};

export type McpToolAnnotations = {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

export type AgentModelOutput =
    | { type: 'text'; value: string }
    | { type: 'error-text'; value: string };

export type AgentToModelOutput<TOutput = unknown> = (args: {
    output: TOutput;
}) => AgentModelOutput;

export type StandardAgentToolOutput = {
    result: string;
    metadata: { status: string };
};

export type AgentOutputSchema = z.ZodTypeAny;

export type AgentToolConfig<
    TOutputSchema extends AgentOutputSchema | undefined = undefined,
> = {
    outputSchema?: TOutputSchema;
    toModelOutput?: AgentToModelOutput<StandardAgentToolOutput>;
};

export type McpOutputSchema = z.ZodObject<z.ZodRawShape>;

export type McpTextContent = { type: 'text'; text: string };

export type McpTextResult = { content: [McpTextContent] };

export type McpErrorResult = {
    isError: true;
    content: [McpTextContent];
};

export type McpStructuredResult<TStructuredContent> = {
    content: [McpTextContent];
    structuredContent: TStructuredContent;
};

export type McpToolResultBuilders<TStructuredContent = unknown> = {
    text(text: string): McpTextResult;
    error(text: string): McpErrorResult;
    structured(
        text: string,
        structuredContent: TStructuredContent,
    ): McpStructuredResult<TStructuredContent>;
};

type McpToolConfigBase = {
    name?: string;
    annotations: McpToolAnnotations;
    meta?: Record<string, unknown>;
};

export type McpToolConfigWithoutOutput = McpToolConfigBase & {
    structuredContentSchema?: undefined;
};

export type McpToolConfigWithOutput<TOutputSchema extends McpOutputSchema> =
    McpToolConfigBase & {
        structuredContentSchema: TOutputSchema;
    };

export type McpToolConfig =
    | McpToolConfigWithoutOutput
    | McpToolConfigWithOutput<McpOutputSchema>;

type AgentToolViewBase<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = {
    name: TName;
    title: string;
    description: string;
    inputSchema: TInput;
};

export type AgentToolView<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TAgentOutputSchema extends AgentOutputSchema | undefined = undefined,
> = AgentToolViewBase<TName, TInput> & {
    outputSchema?: TAgentOutputSchema;
    toModelOutput: AgentToModelOutput<StandardAgentToolOutput>;
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
    result: McpToolResultBuilders;
};

export type McpToolViewWithoutOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = McpToolViewBase<TName, TInput> & {
    outputSchema?: undefined;
};

export type McpToolViewWithOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TOutputSchema extends McpOutputSchema,
> = Omit<McpToolViewBase<TName, TInput>, 'result'> & {
    result: McpToolResultBuilders<z.infer<TOutputSchema>>;
    outputSchema: TOutputSchema;
};

export type ToolDefinitionWithoutMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends AgentOutputSchema | undefined,
> = {
    readonly name: TName;
    readonly title: string;
    readonly availability: readonly ToolRuntime[];
    readonly inputSchema: TInput;
    readonly inputSchemaTransformed: TInputTransformed;
    readonly description: string;
    runtimeName(runtime: ToolRuntime): string;
    for(
        runtime: 'agent',
        options?: ToolRuntimeOptions,
    ): AgentToolView<TName, TInput, TAgentOutputSchema>;
    for(
        runtime: 'mcp',
        options?: ToolRuntimeOptions,
    ): McpToolViewWithoutOutput<TName, TInput>;
};

export type ToolDefinitionWithMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends AgentOutputSchema | undefined,
    TOutputSchema extends McpOutputSchema,
> = {
    readonly name: TName;
    readonly title: string;
    readonly availability: readonly ToolRuntime[];
    readonly inputSchema: TInput;
    readonly inputSchemaTransformed: TInputTransformed;
    readonly description: string;
    runtimeName(runtime: ToolRuntime): string;
    for(
        runtime: 'agent',
        options?: ToolRuntimeOptions,
    ): AgentToolView<TName, TInput, TAgentOutputSchema>;
    for(
        runtime: 'mcp',
        options?: ToolRuntimeOptions,
    ): McpToolViewWithOutput<TName, TInput, TOutputSchema>;
};

export type ToolDefinition<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
    TAgentOutputSchema extends AgentOutputSchema | undefined = undefined,
> =
    | ToolDefinitionWithoutMcpOutput<
          TName,
          TInput,
          TInputTransformed,
          TAgentOutputSchema
      >
    | ToolDefinitionWithMcpOutput<
          TName,
          TInput,
          TInputTransformed,
          TAgentOutputSchema,
          McpOutputSchema
      >;

export type ToolDefinitionInstance = ToolDefinition<
    string,
    z.ZodObject<z.ZodRawShape>,
    z.ZodTypeAny,
    AgentOutputSchema | undefined
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
    TAgentOutputSchema extends AgentOutputSchema | undefined,
> = {
    name: TName;
    title: string;
    description: ToolDescription;
    descriptionVarsSchema?: z.ZodType<unknown>;
    availability: readonly ToolRuntime[];
    inputSchema: TInput;
    inputSchemaTransformed?: TInputTransformed;
    agent?: AgentToolConfig<TAgentOutputSchema>;
};

type ToolDefinitionArgsWithoutMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends AgentOutputSchema | undefined,
> = ToolDefinitionArgsBase<
    TName,
    TInput,
    TInputTransformed,
    TAgentOutputSchema
> & {
    mcp?: McpToolConfigWithoutOutput;
};

type ToolDefinitionArgsWithMcpOutput<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny,
    TAgentOutputSchema extends AgentOutputSchema | undefined,
    TOutputSchema extends McpOutputSchema,
> = ToolDefinitionArgsBase<
    TName,
    TInput,
    TInputTransformed,
    TAgentOutputSchema
> & {
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

const hasMcpStructuredContentSchema = (
    mcpConfig: McpToolConfig | undefined,
): mcpConfig is McpToolConfigWithOutput<McpOutputSchema> =>
    mcpConfig?.structuredContentSchema !== undefined;

export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
    TAgentOutputSchema extends AgentOutputSchema | undefined = undefined,
    TOutputSchema extends McpOutputSchema = McpOutputSchema,
>(
    def: ToolDefinitionArgsWithMcpOutput<
        TName,
        TInput,
        TInputTransformed,
        TAgentOutputSchema,
        TOutputSchema
    >,
): ToolDefinitionWithMcpOutput<
    TName,
    TInput,
    TInputTransformed,
    TAgentOutputSchema,
    TOutputSchema
>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
    TAgentOutputSchema extends AgentOutputSchema | undefined = undefined,
>(
    def: ToolDefinitionArgsWithoutMcpOutput<
        TName,
        TInput,
        TInputTransformed,
        TAgentOutputSchema
    >,
): ToolDefinitionWithoutMcpOutput<
    TName,
    TInput,
    TInputTransformed,
    TAgentOutputSchema
>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    def:
        | ToolDefinitionArgsWithoutMcpOutput<
              TName,
              TInput,
              z.ZodTypeAny,
              AgentOutputSchema | undefined
          >
        | ToolDefinitionArgsWithMcpOutput<
              TName,
              TInput,
              z.ZodTypeAny,
              AgentOutputSchema | undefined,
              McpOutputSchema
          >,
):
    | ToolDefinitionWithoutMcpOutput<
          TName,
          TInput,
          z.ZodTypeAny,
          AgentOutputSchema | undefined
      >
    | ToolDefinitionWithMcpOutput<
          TName,
          TInput,
          z.ZodTypeAny,
          AgentOutputSchema | undefined,
          McpOutputSchema
      > {
    validateToolDefinition(def);

    const inputSchemaTransformed =
        def.inputSchemaTransformed ?? def.inputSchema;

    const mcpConfig: McpToolConfig | undefined = def.mcp;

    if (hasMcpStructuredContentSchema(mcpConfig)) {
        return new ToolDefinitionWithMcpOutputImpl({
            name: def.name,
            title: def.title,
            description: def.description,
            descriptionVarsSchema: def.descriptionVarsSchema ?? null,
            availability: def.availability,
            inputSchema: def.inputSchema,
            inputSchemaTransformed,
            agentConfig: def.agent ?? null,
            mcpConfig,
        });
    }

    return new ToolDefinitionWithoutMcpOutputImpl({
        name: def.name,
        title: def.title,
        description: def.description,
        descriptionVarsSchema: def.descriptionVarsSchema ?? null,
        availability: def.availability,
        inputSchema: def.inputSchema,
        inputSchemaTransformed,
        agentConfig: def.agent ?? null,
        mcpConfig: mcpConfig ?? null,
    });
}
