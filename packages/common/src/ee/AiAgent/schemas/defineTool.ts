import snakeCase from 'lodash/snakeCase';
import { type z } from 'zod';
import { toMcpInputShape } from './mcpSchemaCompat';

/**
 * A tool can be exposed to the agent runtime (AI SDK `tool()`), the MCP
 * runtime (`mcpServer.registerTool`), or both. Availability both documents
 * intent and — through {@link ToolDefinition.for} — gates which runtime views
 * are reachable at compile time.
 */
export type ToolRuntime = 'agent' | 'mcp';
export type ToolAvailability = 'agent' | 'mcp' | 'both';

/** Runtimes reachable for a given availability. */
type AllowedRuntime<TAvailability extends ToolAvailability> =
    TAvailability extends 'both' ? ToolRuntime : TAvailability;

/**
 * A tool's description. Either a fixed string, or a closure that receives the
 * tool's name *in the current runtime* (camelCase for agent, snake_case for
 * MCP). Use the closure when the description text embeds the tool's own name,
 * so the name stays correct across runtimes.
 */
export type ToolDescription = string | ((name: string) => string);

/**
 * MCP tool hints (subset of the MCP spec's ToolAnnotations that we set). All
 * three are required so every MCP tool declares its side-effect profile.
 */
export type McpToolAnnotations = {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

/** MCP-runtime extras. Only `annotations` is required. */
export type McpToolConfig = {
    /**
     * Override the MCP tool name. Defaults to snakeCase(canonical name). Use
     * only when the MCP name is not the snake_case of the agent name — e.g.
     * agent `runQuery` is exposed over MCP as `run_metric_query`.
     */
    name?: string;
    annotations: McpToolAnnotations;
    /**
     * Schema of the MCP `structuredContent` payload. Optional — most tools
     * return text only. NOT run through the input compat layer (it describes
     * output, not LLM-generated input).
     */
    structuredOutputSchema?: z.ZodObject<z.ZodRawShape>;
    /** Raw MCP `_meta` (e.g. `{ ui: { resourceUri } }` for App tools). */
    meta?: Record<string, unknown>;
};

/** Agent-runtime extras. */
export type AgentToolConfig<TOutput extends z.ZodTypeAny> = {
    /** Schema of the value `execute()` returns (e.g. `{ result, metadata }`). */
    outputSchema: TOutput;
};

/**
 * What the agent runtime needs: spread into `tool({ ...view, execute })`.
 * `name` is the camelCase canonical name (used as the ToolSet key).
 */
export type AgentToolView<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TOutput extends z.ZodTypeAny,
> = {
    name: TName;
    title: string;
    description: string;
    inputSchema: TInput;
    outputSchema: TOutput;
};

/**
 * What the MCP runtime needs. `name` is snake_case; `inputSchema` is the
 * compat-transformed raw shape `registerTool` expects. Use
 * {@link ToolDefinition.toMcpRegistration} to turn a tool into the exact
 * registerTool inputs.
 */
export type McpToolView<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = {
    /** snake_case derivation of the canonical name. */
    name: string;
    canonicalName: TName;
    title: string;
    description: string;
    // Typed as the original input shape so registerTool infers concrete
    // handler args. The runtime value is the compat-transformed shape (same
    // keys, coercion-friendly validators) — see toMcpInputShape.
    inputSchema: TInput['shape'];
    annotations: McpToolAnnotations;
    outputSchema: z.ZodRawShape | undefined;
    meta: Record<string, unknown> | undefined;
};

class ToolDefinition<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TAvailability extends ToolAvailability,
    TOutput extends z.ZodTypeAny,
    TInputTransformed extends z.ZodTypeAny,
> {
    readonly name: TName;

    readonly title: string;

    private readonly descriptionFn: ToolDescription;

    readonly availability: TAvailability;

    /** Raw input schema (LLM-generated args, pre-transform). */
    readonly inputSchema: TInput;

    /** Input schema after server-side normalization (defaults to inputSchema
     * when the tool has no transform). Use this to `.parse()` incoming args. */
    readonly inputSchemaTransformed: TInputTransformed;

    /** Agent `execute()` output schema, or null for mcp-only tools. */
    readonly outputSchema: TOutput | null;

    private readonly mcpConfig: McpToolConfig | null;

    constructor(args: {
        name: TName;
        title: string;
        description: ToolDescription;
        availability: TAvailability;
        inputSchema: TInput;
        inputSchemaTransformed: TInputTransformed;
        outputSchema: TOutput | null;
        mcpConfig: McpToolConfig | null;
    }) {
        this.name = args.name;
        this.title = args.title;
        this.descriptionFn = args.description;
        this.availability = args.availability;
        this.inputSchema = args.inputSchema;
        this.inputSchemaTransformed = args.inputSchemaTransformed;
        this.outputSchema = args.outputSchema;
        this.mcpConfig = args.mcpConfig;
    }

    /** Description resolved with the canonical (agent/camelCase) name. For the
     * runtime-correct text, read `.for(runtime).description`. */
    get description(): string {
        return this.resolveDescription(this.name);
    }

    private resolveDescription(name: string): string {
        return typeof this.descriptionFn === 'function'
            ? this.descriptionFn(name)
            : this.descriptionFn;
    }

    /** Runtime-correct view. `.for('mcp')` on an agent-only tool (and vice
     * versa) is a compile error via the availability-gated overloads. */
    for(
        runtime: Extract<AllowedRuntime<TAvailability>, 'agent'>,
    ): AgentToolView<TName, TInput, TOutput>;
    for(
        runtime: Extract<AllowedRuntime<TAvailability>, 'mcp'>,
    ): McpToolView<TName, TInput>;
    for(
        runtime: ToolRuntime,
    ): AgentToolView<TName, TInput, TOutput> | McpToolView<TName, TInput> {
        if (runtime === 'agent') {
            if (this.outputSchema === null) {
                throw new Error(
                    `Tool "${this.name}" is not available in the agent runtime`,
                );
            }
            return {
                name: this.name,
                title: this.title,
                description: this.description,
                inputSchema: this.inputSchema,
                outputSchema: this.outputSchema,
            };
        }

        if (this.mcpConfig === null) {
            throw new Error(
                `Tool "${this.name}" is not available in the MCP runtime`,
            );
        }

        // toMcpInputShape applies the (intentionally loose) compat transform.
        // Output schemas are NOT transformed — they validate results, not
        // LLM-generated input.
        const mcpName = this.mcpConfig.name ?? snakeCase(this.name);
        return {
            name: mcpName,
            canonicalName: this.name,
            title: this.title,
            description: this.resolveDescription(mcpName),
            inputSchema: toMcpInputShape(this.inputSchema),
            annotations: this.mcpConfig.annotations,
            outputSchema: this.mcpConfig.structuredOutputSchema
                ? this.mcpConfig.structuredOutputSchema.shape
                : undefined,
            meta: this.mcpConfig.meta,
        };
    }

    /**
     * Resolve the exact `mcpServer.registerTool(name, config, handler)` inputs
     * for a tool: takes the MCP view (`.for('mcp')`) and returns the snake_case
     * `name` plus the `registration` config (renaming `meta` to `_meta`,
     * omitting absent optionals). Generic over `TInput` so `registration`
     * carries the concrete input shape and `registerTool` can infer handler
     * args; the availability bound rejects agent-only tools at compile time.
     */
    static toMcpRegistration<
        TInput extends z.ZodObject<z.ZodRawShape>,
        TOutput extends z.ZodType<unknown>,
        TInputTransformed extends z.ZodType<unknown>,
    >(
        tool: ToolDefinition<
            string,
            TInput,
            'mcp' | 'both',
            TOutput,
            TInputTransformed
        >,
    ) {
        const view = tool.for('mcp');
        return {
            name: view.name,
            registration: {
                title: view.title,
                description: view.description,
                inputSchema: view.inputSchema,
                annotations: view.annotations,
                ...(view.outputSchema
                    ? { outputSchema: view.outputSchema }
                    : {}),
                ...(view.meta ? { _meta: view.meta } : {}),
            },
        };
    }
}

export type AnyToolDefinition = ToolDefinition<
    string,
    z.ZodObject<z.ZodRawShape>,
    ToolAvailability,
    z.ZodTypeAny,
    z.ZodTypeAny
>;

export { ToolDefinition };

/** Inferred type of a tool's raw input (LLM args). */
export type ToolInput<T extends AnyToolDefinition> = z.infer<T['inputSchema']>;
/** Inferred type of a tool's normalized input (post-transform). */
export type ToolInputTransformed<T extends AnyToolDefinition> = z.infer<
    T['inputSchemaTransformed']
>;
/** Inferred type of a tool's agent output. */
export type ToolOutput<T extends AnyToolDefinition> = z.infer<
    NonNullable<T['outputSchema']>
>;

// Shared base for the public overloads.
type ToolDefinitionBase<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
> = {
    name: TName;
    title: string;
    description: ToolDescription;
    inputSchema: TInput;
    /** Optional normalized variant of inputSchema (`.transform(...)`). */
    inputSchemaTransformed?: z.ZodTypeAny;
};

/**
 * Define a tool once, consume it from both runtimes via `.for(runtime)`, and
 * use the tool object as the single source for its schemas and inferred types
 * ({@link ToolInput}, {@link ToolInputTransformed}, {@link ToolOutput}).
 *
 * `availability` drives which runtime config is required and which `.for()`
 * calls compile:
 * - `'agent'` requires `agent`, forbids `mcp`
 * - `'mcp'` requires `mcp`, forbids `agent`
 * - `'both'` requires both
 */
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TOutput extends z.ZodTypeAny,
    TInputTransformed extends z.ZodTypeAny = TInput,
>(
    def: ToolDefinitionBase<TName, TInput> & {
        availability: 'agent';
        inputSchemaTransformed?: TInputTransformed;
        agent: AgentToolConfig<TOutput>;
    },
): ToolDefinition<TName, TInput, 'agent', TOutput, TInputTransformed>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TInputTransformed extends z.ZodTypeAny = TInput,
>(
    def: ToolDefinitionBase<TName, TInput> & {
        availability: 'mcp';
        inputSchemaTransformed?: TInputTransformed;
        mcp: McpToolConfig;
    },
): ToolDefinition<TName, TInput, 'mcp', z.ZodNever, TInputTransformed>;
export function defineTool<
    TName extends string,
    TInput extends z.ZodObject<z.ZodRawShape>,
    TOutput extends z.ZodTypeAny,
    TInputTransformed extends z.ZodTypeAny = TInput,
>(
    def: ToolDefinitionBase<TName, TInput> & {
        availability: 'both';
        inputSchemaTransformed?: TInputTransformed;
        agent: AgentToolConfig<TOutput>;
        mcp: McpToolConfig;
    },
): ToolDefinition<TName, TInput, 'both', TOutput, TInputTransformed>;
export function defineTool(
    def: ToolDefinitionBase<string, z.ZodObject<z.ZodRawShape>> & {
        availability: ToolAvailability;
        agent?: AgentToolConfig<z.ZodTypeAny>;
        mcp?: McpToolConfig;
    },
): AnyToolDefinition {
    return new ToolDefinition({
        name: def.name,
        title: def.title,
        description: def.description,
        availability: def.availability,
        inputSchema: def.inputSchema,
        inputSchemaTransformed: def.inputSchemaTransformed ?? def.inputSchema,
        outputSchema: def.agent ? def.agent.outputSchema : null,
        mcpConfig: def.mcp ?? null,
    });
}
