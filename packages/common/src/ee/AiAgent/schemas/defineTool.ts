import { type Tool } from 'ai';
import { type z } from 'zod';
import assertUnreachable from '../../../utils/assertUnreachable';
import { createAgentInputSchema } from './agentInputSchema';
import {
    createMcpCompatibleInputSchema,
    type McpCompatibleInputSchema,
} from './McpSchemaCompatLayer';
import {
    createMcpToolResultBuilders,
    defaultAgentToModelOutput,
    resolveDescription,
} from './toolDefinitionUtils';

export type ToolRuntime = 'agent' | 'mcp';

export type ToolDescriptionContext = {
    runtime: ToolRuntime;
    // The tool's own name as exposed to this runtime (canonical for agent,
    // snake_case for mcp), so a description can reference itself.
    toolName: string;
};

export type ToolDescription =
    | string
    | ((context: ToolDescriptionContext) => string);

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

// TODO: tighten this back to a recursive JSONValue type once all tool
// outputs are migrated away from loose object payloads.
export type ToolJsonValue = Record<string, unknown>;

export type ToolOutputMetadata = Record<string, unknown>;

export type ToolOutputSuccessItem =
    | {
          status: 'success';
          type: 'json';
          result: ToolJsonValue;
          metadata?: ToolOutputMetadata;
      }
    | {
          status: 'success';
          type: 'csv';
          result: string;
          metadata?: ToolOutputMetadata;
      }
    | {
          status: 'success';
          type: 'string';
          result: string;
          metadata?: ToolOutputMetadata;
      };

export type ToolOutputError = {
    status: 'error';
    error: string;
    metadata?: ToolOutputMetadata;
};

export type ToolOutputItem = ToolOutputSuccessItem | ToolOutputError;

// An error is always a single item; only successes may come as a list.
export type ToolOutput = ToolOutputItem | ToolOutputSuccessItem[];

export type ToolMeta = Record<string, unknown>;

export type ToolInputSchema = z.ZodObject<z.ZodRawShape>;
export type ToolTransformedInputSchema<
    TInput extends ToolInputSchema = ToolInputSchema,
> = z.ZodType<unknown> & { readonly __inputSchema?: TInput };

// MCP requires structuredContent (and its advertised schema) to be a single
// object, so the payload schema is object-shaped rather than the envelope union.
export type ToolStructuredContentSchema = z.ZodType<ToolJsonValue>;

export type ToolOutputSchema = z.ZodType<ToolOutput> & {
    structuredContentSchema: ToolStructuredContentSchema | undefined;
};

type StructuredContentSchemaOf<TOutputSchema extends ToolOutputSchema> =
    TOutputSchema['structuredContentSchema'];

type StructuredContentOf<TOutputSchema extends ToolOutputSchema> =
    StructuredContentSchemaOf<TOutputSchema> extends ToolStructuredContentSchema
        ? z.infer<StructuredContentSchemaOf<TOutputSchema>>
        : never;

export type AgentToolConfig = {
    toModelOutput: AgentToModelOutput<ToolOutput>;
};

export type McpToolConfig<TMcpName extends string = string> = {
    name: TMcpName;
    annotations: McpToolAnnotations;
};

export type McpTextContent = { type: 'text'; text: string };

export type McpContent = [McpTextContent, ...McpTextContent[]];

export type McpTextResult = { content: McpContent };

export type McpErrorResult = {
    isError: true;
    content: McpContent;
};

export type McpStructuredResult<TStructuredContent> = {
    content: McpContent;
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

type McpToolViewBase<
    TName extends string,
    TInput extends ToolInputSchema,
    TStructuredContent,
    TMcpName extends string,
> = {
    name: TMcpName;
    canonicalName: TName;
    title: string;
    description: string;
    inputSchema: McpCompatibleInputSchema<TInput>;
    annotations: McpToolAnnotations;
    meta: ToolMeta | undefined;
    result: McpToolResultBuilders<TStructuredContent>;
};

export type McpToolView<
    TName extends string,
    TInput extends ToolInputSchema,
    TOutputSchema extends ToolOutputSchema,
    TMcpName extends string = string,
> = McpToolViewBase<
    TName,
    TInput,
    StructuredContentOf<TOutputSchema>,
    TMcpName
> & {
    outputSchema: StructuredContentSchemaOf<TOutputSchema>;
};

export type AgentOnlyAvailability = {
    runtime: 'agent';
    // Config object with a sensible default: omit to use defaultAgentToModelOutput
    agent?: AgentToolConfig;
};

export type McpOnlyAvailability<TMcpName extends string = string> = {
    runtime: 'mcp';
    mcp: McpToolConfig<TMcpName>;
};

export type AgentAndMcpAvailability<TMcpName extends string = string> = {
    runtime: 'both';
    agent?: AgentToolConfig;
    mcp: McpToolConfig<TMcpName>;
};

export type ToolAvailability =
    | AgentOnlyAvailability
    | McpOnlyAvailability
    | AgentAndMcpAvailability;

type McpNameForAvailability<TAvailability extends ToolAvailability> =
    TAvailability extends
        | McpOnlyAvailability<infer TMcpName>
        | AgentAndMcpAvailability<infer TMcpName>
        ? TMcpName
        : never;

// TODO: temporary ai-sdk build override bag until we split adapter/runtime
// concerns more cleanly.
type AiSdkBuildArgs<TInput extends ToolInputSchema> = {
    execute: NonNullable<Tool<z.infer<TInput>, ToolOutput>['execute']>;
} & Partial<
    Pick<
        Tool<z.infer<TInput>, ToolOutput>,
        'title' | 'description' | 'inputSchema' | 'needsApproval' | 'strict'
    >
>;

type ToolDefinitionRuntimeViews<
    TName extends string,
    TInput extends ToolInputSchema,
    TOutputSchema extends ToolOutputSchema,
    TAvailability extends ToolAvailability,
> = [TAvailability] extends [AgentOnlyAvailability]
    ? {
          for(runtime: 'ai-sdk'): Pick<
              Tool<z.infer<TInput>, ToolOutput>,
              'title' | 'description' | 'inputSchema' | 'outputSchema'
          > & {
              toModelOutput: NonNullable<
                  Tool<unknown, ToolOutput>['toModelOutput']
              >;
              build(
                  args: AiSdkBuildArgs<TInput>,
              ): Tool<z.infer<TInput>, ToolOutput>;
          };
      }
    : [TAvailability] extends [McpOnlyAvailability]
      ? {
            for(
                runtime: 'mcp',
            ): McpToolView<
                TName,
                TInput,
                TOutputSchema,
                McpNameForAvailability<TAvailability>
            >;
        }
      : {
            for(runtime: 'ai-sdk'): Pick<
                Tool<z.infer<TInput>, ToolOutput>,
                'title' | 'description' | 'inputSchema' | 'outputSchema'
            > & {
                toModelOutput: NonNullable<
                    Tool<unknown, ToolOutput>['toModelOutput']
                >;
                build(
                    args: AiSdkBuildArgs<TInput>,
                ): Tool<z.infer<TInput>, ToolOutput>;
            };
            for(
                runtime: 'mcp',
            ): McpToolView<
                TName,
                TInput,
                TOutputSchema,
                McpNameForAvailability<TAvailability>
            >;
        };

export type ToolDefinition<
    TName extends string,
    TInput extends ToolInputSchema,
    TInputTransformed extends ToolTransformedInputSchema<TInput> = TInput,
    TOutputSchema extends ToolOutputSchema = ToolOutputSchema,
    TAvailability extends ToolAvailability = ToolAvailability,
> = {
    readonly name: TName;
    readonly title: string;
    readonly availability: TAvailability;
    readonly inputSchema: TInput;
    readonly inputSchemaTransformed: TInputTransformed;
    readonly outputSchema: TOutputSchema;
    readonly meta: ToolMeta | undefined;
    readonly description: string;
} & ToolDefinitionRuntimeViews<TName, TInput, TOutputSchema, TAvailability>;

type AnyToolDefinition<
    TName extends string,
    TInput extends ToolInputSchema,
    TInputTransformed extends ToolTransformedInputSchema<TInput>,
    TOutputSchema extends ToolOutputSchema,
> =
    | ToolDefinition<
          TName,
          TInput,
          TInputTransformed,
          TOutputSchema,
          AgentOnlyAvailability
      >
    | ToolDefinition<
          TName,
          TInput,
          TInputTransformed,
          TOutputSchema,
          McpOnlyAvailability
      >
    | ToolDefinition<
          TName,
          TInput,
          TInputTransformed,
          TOutputSchema,
          AgentAndMcpAvailability
      >;

export type ToolDefinitionInstance = AnyToolDefinition<
    string,
    ToolInputSchema,
    ToolTransformedInputSchema<ToolInputSchema>,
    ToolOutputSchema
>;

export type ToolInput<T extends { inputSchema: ToolInputSchema }> = z.infer<
    T['inputSchema']
>;

export type ToolInputTransformed<
    T extends {
        inputSchemaTransformed: ToolTransformedInputSchema<T['inputSchema']>;
    } & {
        inputSchema: ToolInputSchema;
    },
> = z.infer<T['inputSchemaTransformed']>;

export type ToolDefinitionArgs<
    TName extends string,
    TInput extends ToolInputSchema,
    TInputTransformed extends ToolTransformedInputSchema<TInput>,
    TOutputSchema extends ToolOutputSchema,
    TAvailability extends ToolAvailability,
> = {
    name: TName;
    title: string;
    description: ToolDescription;
    availability: TAvailability;
    inputSchema: TInput;
    inputSchemaTransformed?: TInputTransformed;
    outputSchema: TOutputSchema;
    meta?: ToolMeta;
};

export function defineTool<
    TName extends string,
    TInput extends ToolInputSchema,
    TOutputSchema extends ToolOutputSchema,
    TAvailability extends ToolAvailability,
>(
    def: ToolDefinitionArgs<
        TName,
        TInput,
        TInput,
        TOutputSchema,
        TAvailability
    > & {
        inputSchemaTransformed?: undefined;
    },
): ToolDefinition<TName, TInput, TInput, TOutputSchema, TAvailability>;
export function defineTool<
    TName extends string,
    TInput extends ToolInputSchema,
    TInputTransformed extends ToolTransformedInputSchema<TInput>,
    TOutputSchema extends ToolOutputSchema,
    TAvailability extends ToolAvailability,
>(
    def: ToolDefinitionArgs<
        TName,
        TInput,
        TInputTransformed,
        TOutputSchema,
        TAvailability
    > & {
        inputSchemaTransformed: TInputTransformed;
    },
): ToolDefinition<
    TName,
    TInput,
    TInputTransformed,
    TOutputSchema,
    TAvailability
>;
export function defineTool<
    TName extends string,
    TInput extends ToolInputSchema,
    TOutputSchema extends ToolOutputSchema,
>(
    def: ToolDefinitionArgs<
        TName,
        TInput,
        ToolTransformedInputSchema<TInput>,
        TOutputSchema,
        ToolAvailability
    >,
): AnyToolDefinition<
    TName,
    TInput,
    ToolTransformedInputSchema<TInput>,
    TOutputSchema
> {
    const inputSchemaTransformed: ToolTransformedInputSchema<TInput> =
        def.inputSchemaTransformed ?? def.inputSchema;

    const buildAiSdkView = (
        agentConfig: AgentToolConfig | undefined,
    ): Pick<
        Tool<z.infer<TInput>, ToolOutput>,
        'title' | 'description' | 'inputSchema' | 'outputSchema'
    > & {
        toModelOutput: NonNullable<Tool<unknown, ToolOutput>['toModelOutput']>;
        build(args: AiSdkBuildArgs<TInput>): Tool<z.infer<TInput>, ToolOutput>;
    } => {
        const agentToModelOutput =
            agentConfig?.toModelOutput ?? defaultAgentToModelOutput;
        const toModelOutput: NonNullable<
            Tool<unknown, ToolOutput>['toModelOutput']
        > = ({ output }) => agentToModelOutput({ output });

        const aiSdkToolDefinition = {
            title: def.title,
            description: resolveDescription(def.description, {
                runtime: 'agent',
                toolName: def.name,
            }),
            inputSchema: createAgentInputSchema(def.inputSchema),
            outputSchema: def.outputSchema,
            toModelOutput,
        };

        return {
            ...aiSdkToolDefinition,
            build: ({ execute, ...overrides }) => ({
                ...aiSdkToolDefinition,
                ...overrides,
                execute,
            }),
        };
    };

    const buildMcpView = <TMcpName extends string>(
        mcpConfig: McpToolConfig<TMcpName>,
    ): McpToolView<TName, TInput, TOutputSchema, TMcpName> => ({
        name: mcpConfig.name,
        canonicalName: def.name,
        title: def.title,
        description: resolveDescription(def.description, {
            runtime: 'mcp',
            toolName: mcpConfig.name,
        }),
        inputSchema: createMcpCompatibleInputSchema(def.inputSchema),
        annotations: mcpConfig.annotations,
        outputSchema: def.outputSchema.structuredContentSchema,
        meta: def.meta,
        result: createMcpToolResultBuilders<
            StructuredContentOf<TOutputSchema>
        >(),
    });

    const base = {
        name: def.name,
        title: def.title,
        inputSchema: def.inputSchema,
        inputSchemaTransformed,
        outputSchema: def.outputSchema,
        meta: def.meta,
        get description() {
            return resolveDescription(def.description, {
                runtime: 'agent',
                toolName: def.name,
            });
        },
    };

    const buildBothRuntimeDefinition = <TMcpName extends string>(
        availability: AgentAndMcpAvailability<TMcpName>,
    ): ToolDefinition<
        TName,
        TInput,
        ToolTransformedInputSchema<TInput>,
        TOutputSchema,
        AgentAndMcpAvailability<TMcpName>
    > => {
        const { agent, mcp } = availability;

        function forRuntime(runtime: 'ai-sdk'): Pick<
            Tool<z.infer<TInput>, ToolOutput>,
            'title' | 'description' | 'inputSchema' | 'outputSchema'
        > & {
            toModelOutput: NonNullable<
                Tool<unknown, ToolOutput>['toModelOutput']
            >;
            build(
                args: AiSdkBuildArgs<TInput>,
            ): Tool<z.infer<TInput>, ToolOutput>;
        };
        function forRuntime(
            runtime: 'mcp',
        ): McpToolView<TName, TInput, TOutputSchema, TMcpName>;
        function forRuntime(runtime: 'ai-sdk' | 'mcp') {
            switch (runtime) {
                case 'ai-sdk':
                    return buildAiSdkView(agent);
                case 'mcp':
                    return buildMcpView(mcp);
                default:
                    return assertUnreachable(runtime, 'Unknown tool runtime');
            }
        }

        return {
            ...base,
            availability,
            for: forRuntime,
        };
    };

    switch (def.availability.runtime) {
        case 'agent': {
            const { agent } = def.availability;
            return {
                ...base,
                availability: def.availability,
                for(_runtime: 'ai-sdk') {
                    return buildAiSdkView(agent);
                },
            };
        }
        case 'mcp': {
            const { mcp } = def.availability;
            return {
                ...base,
                availability: def.availability,
                for(_runtime: 'mcp') {
                    return buildMcpView(mcp);
                },
            };
        }
        case 'both':
            return buildBothRuntimeDefinition(def.availability);
        default:
            return assertUnreachable(
                def.availability,
                'Unknown tool availability',
            );
    }
}
