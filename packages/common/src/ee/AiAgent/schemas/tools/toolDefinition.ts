import snakeCase from 'lodash/snakeCase';
import type { SnakeCase } from 'type-fest';
import { z } from 'zod';
import { getMcpCompatibleSchema } from '../mcpSchemaCompat';
import {
    createToolSchemaBuilder,
    type ToolSchemaBuilder,
} from '../toolSchemaBuilder';

export type ToolContext = 'agent' | 'mcp';

type ToolContexts = readonly [ToolContext, ...ToolContext[]];

type ToolNameForContext<
    TCanonicalName extends string,
    TContext extends ToolContext,
> = TContext extends 'agent' ? TCanonicalName : SnakeCase<TCanonicalName>;

export type BoundToolIdentity<
    TCanonicalName extends string,
    TContext extends ToolContext,
> = {
    canonicalName: TCanonicalName;
    context: TContext;
    name: ToolNameForContext<TCanonicalName, TContext>;
    title: string;
};

export type ToolIdentityLookup<TContext extends ToolContext> = Readonly<
    Record<string, BoundToolIdentity<string, TContext>>
>;

export type BoundToolContract<
    TCanonicalName extends string,
    TContext extends ToolContext,
    TInputSchema extends z.AnyZodObject,
    TOutputSchema extends z.ZodTypeAny,
    TParsedInput,
> = BoundToolIdentity<TCanonicalName, TContext> & {
    description: string;
    schema: TContext extends 'agent' ? TInputSchema : TInputSchema['shape'];
    inputSchema: TInputSchema;
    outputSchema: TOutputSchema;
    parseInput: (raw: unknown) => TParsedInput;
    safeParseInput: (
        raw: unknown,
    ) => z.SafeParseReturnType<unknown, TParsedInput>;
};

export type ToolContractLookup<TContext extends ToolContext> = Readonly<
    Record<
        string,
        BoundToolContract<
            string,
            TContext,
            z.AnyZodObject,
            z.ZodTypeAny,
            unknown
        >
    >
>;

type ToolDescriptionInput<
    TCanonicalName extends string,
    TContext extends ToolContext,
> = string | ((tool: BoundToolIdentity<TCanonicalName, TContext>) => string);

type ToolSchemaFactoryArgs<
    TCanonicalName extends string,
    TContext extends ToolContext,
> = {
    tools: ToolIdentityLookup<TContext>;
    createSchema: () => ToolSchemaBuilder<{}>;
};

type ToolInputSchemaFactory<
    TCanonicalName extends string,
    TContext extends ToolContext,
    TInputSchema extends z.AnyZodObject,
> = (args: ToolSchemaFactoryArgs<TCanonicalName, TContext>) => TInputSchema;

type ToolInputSchemaFactories<
    TCanonicalName extends string,
    TContexts extends ToolContexts,
> = {
    [TContext in TContexts[number]]: ToolInputSchemaFactory<
        TCanonicalName,
        TContext,
        z.AnyZodObject
    >;
};

type ToolOutputSchemaOverrides<TContexts extends ToolContexts> = Partial<{
    [TContext in TContexts[number]]: z.ZodTypeAny;
}>;

type ToolParseInputOverride<TContext extends ToolContext, TParsedInput> = (
    raw: unknown,
    tools: ToolContractLookup<TContext>,
) => TParsedInput;

type ToolParseInputOverrides<TContexts extends ToolContexts> = Partial<{
    [TContext in TContexts[number]]: ToolParseInputOverride<TContext, unknown>;
}>;

type ToolDefinitionConfig<
    TCanonicalName extends string,
    TContexts extends ToolContexts,
    TInputSchemaFactories extends ToolInputSchemaFactories<
        TCanonicalName,
        TContexts
    >,
    TOutputSchema extends z.ZodTypeAny,
    TOutputSchemaOverrides extends ToolOutputSchemaOverrides<TContexts>,
    TParseInputOverrides extends ToolParseInputOverrides<TContexts>,
> = {
    canonicalName: TCanonicalName;
    title: string;
    contexts: TContexts;
    description?: {
        [TContext in TContexts[number]]: ToolDescriptionInput<
            TCanonicalName,
            TContext
        >;
    };
    buildInputSchemas: TInputSchemaFactories;
    outputSchema: TOutputSchema;
    outputSchemas?: TOutputSchemaOverrides;
    parseInput?: TParseInputOverrides;
};

type ToolDefinitionRuntime = {
    readonly canonicalName: string;
    readonly title: string;
    readonly contexts: readonly ToolContext[];
    readonly description?: Partial<Record<ToolContext, string>>;
    supportsContext: (context: ToolContext) => boolean;
    createIdentityForContext: (
        context: ToolContext,
    ) => BoundToolIdentity<string, ToolContext>;
    createBoundToolForContext: (
        context: ToolContext,
        identityTools: ToolIdentityLookup<ToolContext>,
        boundTools: ToolContractLookup<ToolContext>,
    ) => BoundToolContract<
        string,
        ToolContext,
        z.AnyZodObject,
        z.ZodTypeAny,
        unknown
    >;
};

type InputSchemaFromFactories<
    TCanonicalName extends string,
    TInputSchemaFactories,
    TContext extends ToolContext,
> =
    TInputSchemaFactories extends Record<string, unknown>
        ? TInputSchemaFactories[TContext] extends ToolInputSchemaFactory<
              TCanonicalName,
              TContext,
              infer TInputSchema
          >
            ? TInputSchema
            : never
        : never;

type InputSchemaForContext<TToolDefinition, TContext extends ToolContext> =
    TToolDefinition extends ToolDefinition<
        infer TCanonicalName,
        infer TContexts,
        infer TInputSchemaFactories,
        z.ZodTypeAny,
        infer TOutputSchemaOverrides,
        infer TParseInputOverrides
    >
        ? TContext extends TContexts[number]
            ? InputSchemaFromFactories<
                  TCanonicalName,
                  TInputSchemaFactories,
                  TContext
              >
            : never
        : never;

type OutputSchemaForContext<TToolDefinition, TContext extends ToolContext> =
    TToolDefinition extends ToolDefinition<
        string,
        ToolContexts,
        ToolInputSchemaFactories<string, ToolContexts>,
        infer TOutputSchema,
        infer TOutputSchemaOverrides,
        ToolParseInputOverrides<ToolContexts>
    >
        ? TContext extends keyof TOutputSchemaOverrides
            ? TOutputSchemaOverrides[TContext] extends z.ZodTypeAny
                ? TOutputSchemaOverrides[TContext]
                : TOutputSchema
            : TOutputSchema
        : never;

type ParsedInputForContext<TToolDefinition, TContext extends ToolContext> =
    TToolDefinition extends ToolDefinition<
        infer TCanonicalName,
        infer TContexts,
        infer TInputSchemaFactories,
        z.ZodTypeAny,
        infer TOutputSchemaOverrides,
        infer TParseInputOverrides
    >
        ? TContext extends TContexts[number]
            ? TContext extends keyof TParseInputOverrides
                ? TParseInputOverrides[TContext] extends ToolParseInputOverride<
                      TContext,
                      infer TParsedInput
                  >
                    ? TParsedInput
                    : never
                : z.infer<
                      InputSchemaFromFactories<
                          TCanonicalName,
                          TInputSchemaFactories,
                          TContext
                      >
                  >
            : never
        : never;

type SupportedToolKeys<
    TTools extends Record<string, ToolDefinitionRuntime>,
    TContext extends ToolContext,
> = {
    [TToolKey in keyof TTools]: TTools[TToolKey] extends ToolDefinition<
        infer TCanonicalName,
        infer TContexts,
        infer TInputSchemaFactories,
        infer TOutputSchema,
        infer TOutputSchemaOverrides,
        infer TParseInputOverrides
    >
        ? TContext extends TContexts[number]
            ? TToolKey
            : never
        : never;
}[keyof TTools];

export type BoundToolRegistry<
    TTools extends Record<string, ToolDefinitionRuntime>,
    TContext extends ToolContext,
> = Readonly<{
    [TToolKey in SupportedToolKeys<
        TTools,
        TContext
    >]: TTools[TToolKey] extends ToolDefinition<
        infer TCanonicalName,
        infer TContexts,
        infer TInputSchemaFactories,
        infer TOutputSchema,
        infer TOutputSchemaOverrides,
        infer TParseInputOverrides
    >
        ? BoundToolContract<
              TCanonicalName,
              TContext,
              InputSchemaForContext<TTools[TToolKey], TContext>,
              OutputSchemaForContext<TTools[TToolKey], TContext>,
              ParsedInputForContext<TTools[TToolKey], TContext>
          >
        : never;
}>;

const getToolNameForContext = <
    const TCanonicalName extends string,
    const TContext extends ToolContext,
>(
    canonicalName: TCanonicalName,
    context: TContext,
): ToolNameForContext<TCanonicalName, TContext> =>
    (context === 'agent'
        ? canonicalName
        : snakeCase(canonicalName)) as ToolNameForContext<
        TCanonicalName,
        TContext
    >;

const createBoundToolSchema = <TDescription extends string | undefined>(
    description: TDescription,
) =>
    createToolSchemaBuilder(
        description ? z.object({}).describe(description) : z.object({}),
    );

const objectEntries = <T extends Record<string, unknown>>(record: T) =>
    Object.entries(record) as Array<
        {
            [TKey in keyof T]: [TKey, T[TKey]];
        }[keyof T]
    >;

export class ToolDefinition<
    TCanonicalName extends string,
    TContexts extends ToolContexts,
    TInputSchemaFactories extends ToolInputSchemaFactories<
        TCanonicalName,
        TContexts
    >,
    TOutputSchema extends z.ZodTypeAny,
    TOutputSchemaOverrides extends ToolOutputSchemaOverrides<TContexts>,
    TParseInputOverrides extends ToolParseInputOverrides<TContexts>,
> implements ToolDefinitionRuntime {
    readonly canonicalName: TCanonicalName;

    readonly title: string;

    readonly contexts: TContexts;

    readonly outputSchema: TOutputSchema;

    private readonly outputSchemaOverrides: TOutputSchemaOverrides;

    private readonly descriptionConfig?: ToolDefinitionConfig<
        TCanonicalName,
        TContexts,
        TInputSchemaFactories,
        TOutputSchema,
        TOutputSchemaOverrides,
        TParseInputOverrides
    >['description'];

    private readonly buildInputSchemas: TInputSchemaFactories;

    private readonly parseInputOverrides: TParseInputOverrides;

    constructor(
        config: ToolDefinitionConfig<
            TCanonicalName,
            TContexts,
            TInputSchemaFactories,
            TOutputSchema,
            TOutputSchemaOverrides,
            TParseInputOverrides
        >,
    ) {
        this.canonicalName = config.canonicalName;
        this.title = config.title;
        this.contexts = config.contexts;
        this.outputSchema = config.outputSchema;
        this.outputSchemaOverrides =
            config.outputSchemas ?? ({} as TOutputSchemaOverrides);
        this.descriptionConfig = config.description;
        this.buildInputSchemas = config.buildInputSchemas;
        this.parseInputOverrides =
            config.parseInput ?? ({} as TParseInputOverrides);
    }

    supportsContext(context: ToolContext): context is TContexts[number] {
        return this.contexts.includes(context as TContexts[number]);
    }

    private createIdentity<TContext extends TContexts[number]>(
        context: TContext,
    ): BoundToolIdentity<TCanonicalName, TContext> {
        return {
            canonicalName: this.canonicalName,
            context,
            name: getToolNameForContext(this.canonicalName, context),
            title: this.title,
        };
    }

    createIdentityForContext(
        context: ToolContext,
    ): BoundToolIdentity<string, ToolContext> {
        if (!this.supportsContext(context)) {
            throw new Error(
                `Tool ${this.canonicalName} does not support ${context} context`,
            );
        }

        const identity = this.createIdentity(context);

        return {
            canonicalName: identity.canonicalName,
            context: identity.context,
            name: identity.name,
            title: identity.title,
        };
    }

    private createBoundTool<TContext extends TContexts[number]>(
        context: TContext,
        identityTools: ToolIdentityLookup<TContext>,
        boundTools: ToolContractLookup<TContext>,
    ): BoundToolContract<
        TCanonicalName,
        TContext,
        InputSchemaFromFactories<
            TCanonicalName,
            TInputSchemaFactories,
            TContext
        >,
        OutputSchemaForContext<
            ToolDefinition<
                TCanonicalName,
                TContexts,
                TInputSchemaFactories,
                TOutputSchema,
                TOutputSchemaOverrides,
                TParseInputOverrides
            >,
            TContext
        >,
        ParsedInputForContext<
            ToolDefinition<
                TCanonicalName,
                TContexts,
                TInputSchemaFactories,
                TOutputSchema,
                TOutputSchemaOverrides,
                TParseInputOverrides
            >,
            TContext
        >
    > {
        const identity = this.createIdentity(context);
        const descriptionInput = this.descriptionConfig?.[context] as
            | ToolDescriptionInput<TCanonicalName, TContext>
            | undefined;
        const description = descriptionInput
            ? typeof descriptionInput === 'function'
                ? descriptionInput(identity)
                : descriptionInput
            : undefined;
        const buildInputSchema = this.buildInputSchemas[
            context
        ] as ToolInputSchemaFactory<TCanonicalName, TContext, z.AnyZodObject>;
        const builtInputSchema = buildInputSchema({
            tools: identityTools,
            createSchema: () => createBoundToolSchema(description),
        }) as InputSchemaFromFactories<
            TCanonicalName,
            TInputSchemaFactories,
            TContext
        >;
        const inputSchema =
            description && builtInputSchema.description !== description
                ? builtInputSchema.describe(description)
                : builtInputSchema;
        const outputSchema =
            this.outputSchemaOverrides[context] ?? this.outputSchema;

        const parseOverride = this.parseInputOverrides[context] as
            | ToolParseInputOverride<
                  TContext,
                  ParsedInputForContext<
                      ToolDefinition<
                          TCanonicalName,
                          TContexts,
                          TInputSchemaFactories,
                          TOutputSchema,
                          TOutputSchemaOverrides,
                          TParseInputOverrides
                      >,
                      TContext
                  >
              >
            | undefined;

        return {
            ...identity,
            description: description ?? inputSchema.description ?? '',
            schema:
                context === 'agent'
                    ? inputSchema
                    : getMcpCompatibleSchema(inputSchema),
            inputSchema,
            outputSchema,
            parseInput: (raw) =>
                parseOverride
                    ? parseOverride(raw, boundTools)
                    : inputSchema.parse(raw),
            safeParseInput: (raw) => {
                if (!parseOverride) {
                    return inputSchema.safeParse(raw) as z.SafeParseReturnType<
                        unknown,
                        ParsedInputForContext<
                            ToolDefinition<
                                TCanonicalName,
                                TContexts,
                                TInputSchemaFactories,
                                TOutputSchema,
                                TOutputSchemaOverrides,
                                TParseInputOverrides
                            >,
                            TContext
                        >
                    >;
                }

                try {
                    return {
                        success: true,
                        data: parseOverride(raw, boundTools),
                    };
                } catch (error) {
                    if (error instanceof z.ZodError) {
                        return {
                            success: false,
                            error,
                        };
                    }

                    throw error;
                }
            },
        } as BoundToolContract<
            TCanonicalName,
            TContext,
            InputSchemaFromFactories<
                TCanonicalName,
                TInputSchemaFactories,
                TContext
            >,
            OutputSchemaForContext<
                ToolDefinition<
                    TCanonicalName,
                    TContexts,
                    TInputSchemaFactories,
                    TOutputSchema,
                    TOutputSchemaOverrides,
                    TParseInputOverrides
                >,
                TContext
            >,
            ParsedInputForContext<
                ToolDefinition<
                    TCanonicalName,
                    TContexts,
                    TInputSchemaFactories,
                    TOutputSchema,
                    TOutputSchemaOverrides,
                    TParseInputOverrides
                >,
                TContext
            >
        >;
    }

    createBoundToolForContext(
        context: ToolContext,
        identityTools: ToolIdentityLookup<ToolContext>,
        boundTools: ToolContractLookup<ToolContext>,
    ): BoundToolContract<
        string,
        ToolContext,
        z.AnyZodObject,
        z.ZodTypeAny,
        unknown
    > {
        if (!this.supportsContext(context)) {
            throw new Error(
                `Tool ${this.canonicalName} does not support ${context} context`,
            );
        }

        return this.createBoundTool(
            context,
            identityTools as ToolIdentityLookup<TContexts[number]>,
            boundTools as ToolContractLookup<TContexts[number]>,
        ) as BoundToolContract<
            string,
            ToolContext,
            z.AnyZodObject,
            z.ZodTypeAny,
            unknown
        >;
    }
}

export const defineTool = <
    const TCanonicalName extends string,
    const TContexts extends ToolContexts,
    const TInputSchemaFactories extends ToolInputSchemaFactories<
        TCanonicalName,
        TContexts
    >,
    const TOutputSchema extends z.ZodTypeAny,
    const TOutputSchemaOverrides extends ToolOutputSchemaOverrides<TContexts>,
    const TParseInputOverrides extends ToolParseInputOverrides<TContexts>,
>(
    config: ToolDefinitionConfig<
        TCanonicalName,
        TContexts,
        TInputSchemaFactories,
        TOutputSchema,
        TOutputSchemaOverrides,
        TParseInputOverrides
    >,
) =>
    new ToolDefinition<
        TCanonicalName,
        TContexts,
        TInputSchemaFactories,
        TOutputSchema,
        TOutputSchemaOverrides,
        TParseInputOverrides
    >(config);

export class ToolRegistry<
    TTools extends Record<string, ToolDefinitionRuntime>,
> {
    private readonly cache = new Map<
        ToolContext,
        BoundToolRegistry<TTools, ToolContext>
    >();

    constructor(private readonly tools: TTools) {}

    for<TContext extends ToolContext>(
        context: TContext,
    ): BoundToolRegistry<TTools, TContext> {
        const cachedRegistry = this.cache.get(context);

        if (cachedRegistry) {
            return cachedRegistry as BoundToolRegistry<TTools, TContext>;
        }

        const identityTools: Record<
            string,
            BoundToolIdentity<string, ToolContext>
        > = {};

        for (const [toolKey, toolDefinition] of objectEntries(this.tools)) {
            if (toolDefinition.supportsContext(context)) {
                identityTools[toolKey as string] =
                    toolDefinition.createIdentityForContext(context);
            }
        }

        const boundTools: Record<
            string,
            BoundToolContract<
                string,
                ToolContext,
                z.AnyZodObject,
                z.ZodTypeAny,
                unknown
            >
        > = {};

        for (const [toolKey, toolDefinition] of objectEntries(this.tools)) {
            if (toolDefinition.supportsContext(context)) {
                boundTools[toolKey as string] =
                    toolDefinition.createBoundToolForContext(
                        context,
                        identityTools,
                        boundTools,
                    );
            }
        }

        const resolvedTools = boundTools as BoundToolRegistry<TTools, TContext>;
        this.cache.set(
            context,
            resolvedTools as BoundToolRegistry<TTools, ToolContext>,
        );

        return resolvedTools;
    }
}

export type ToolInput<TToolDefinition, TContext extends ToolContext> = z.infer<
    InputSchemaForContext<TToolDefinition, TContext>
>;

export type ToolParsedInput<
    TToolDefinition,
    TContext extends ToolContext,
> = ParsedInputForContext<TToolDefinition, TContext>;

type SupportedToolContexts<TToolDefinition> = TToolDefinition extends {
    contexts: infer TContexts;
}
    ? TContexts extends readonly ToolContext[]
        ? TContexts[number]
        : never
    : never;

type DefaultToolOutputContext<TToolDefinition> =
    'agent' extends SupportedToolContexts<TToolDefinition>
        ? 'agent'
        : 'mcp' extends SupportedToolContexts<TToolDefinition>
          ? 'mcp'
          : never;

export type ToolOutput<
    TToolDefinition,
    TContext extends SupportedToolContexts<TToolDefinition> =
        DefaultToolOutputContext<TToolDefinition>,
> = z.infer<OutputSchemaForContext<TToolDefinition, TContext>>;
