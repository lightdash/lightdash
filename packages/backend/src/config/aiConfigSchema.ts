import { z } from 'zod';

export const DEFAULT_OPENAI_MODEL_NAME = 'gpt-4.1';
export const DEFAULT_ANTHROPIC_MODEL_NAME = 'claude-sonnet-4-5';
export const DEFAULT_DEFAULT_AI_PROVIDER = 'openai';
export const DEFAULT_OPENROUTER_MODEL_NAME = 'openai/gpt-4.1-2025-04-14';
export const DEFAULT_BEDROCK_MODEL_NAME = 'claude-sonnet-4-5';

export const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_BEDROCK_EMBEDDING_MODEL = 'cohere.embed-english-v3';

export const aiCopilotConfigSchema = z
    .object({
        defaultProvider: z
            .enum(['openai', 'azure', 'anthropic', 'openrouter', 'bedrock'])
            .default(DEFAULT_DEFAULT_AI_PROVIDER),
        defaultEmbeddingModelProvider: z
            .enum(['openai', 'bedrock'])
            .default(DEFAULT_DEFAULT_AI_PROVIDER),
        providers: z.object({
            openai: z
                .object({
                    apiKey: z.string(),
                    modelName: z.string().default(DEFAULT_OPENAI_MODEL_NAME),
                    embeddingModelName: z
                        .string()
                        .default(DEFAULT_OPENAI_EMBEDDING_MODEL),
                    baseUrl: z.string().optional(),
                    availableModels: z.array(z.string()).optional(),
                })
                .optional(),
            azure: z
                .object({
                    endpoint: z.string(),
                    apiKey: z.string(),
                    apiVersion: z.string(),
                    deploymentName: z.string(),
                })
                .optional(),
            anthropic: z
                .object({
                    apiKey: z.string(),
                    modelName: z.string().default(DEFAULT_ANTHROPIC_MODEL_NAME),
                    availableModels: z.array(z.string()).optional(),
                })
                .optional(),
            openrouter: z
                .object({
                    apiKey: z.string(),
                    /** @ref https://openrouter.ai/docs/features/provider-routing#provider-sorting */
                    sortOrder: z
                        .enum(['price', 'throughput', 'latency'])
                        .default('latency'),
                    /** @ref https://openrouter.ai/models */
                    allowedProviders: z
                        .array(z.enum(['anthropic', 'openai', 'google']))
                        .default(['openai']),
                    modelName: z
                        .string()
                        .default(DEFAULT_OPENROUTER_MODEL_NAME),
                })
                .optional(),
            bedrock: z
                .union([
                    z.object({
                        apiKey: z.string(),
                        region: z.string(),
                        modelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_MODEL_NAME),
                        embeddingModelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_EMBEDDING_MODEL),
                        availableModels: z.array(z.string()).optional(),
                    }),
                    z.object({
                        region: z.string(),
                        accessKeyId: z.string(),
                        secretAccessKey: z.string(),
                        sessionToken: z.string().optional(),
                        modelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_MODEL_NAME),
                        embeddingModelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_EMBEDDING_MODEL),
                        availableModels: z.array(z.string()).optional(),
                    }),
                ])
                .optional(),
        }),
        enabled: z.boolean(),
        requiresFeatureFlag: z.boolean(),
        telemetryEnabled: z.boolean(),
        debugLoggingEnabled: z.boolean(),
        askAiButtonEnabled: z.boolean(),
        embeddingEnabled: z.boolean(),
        maxQueryLimit: z.number().positive(),
        verifiedAnswerSimilarityThreshold: z
            .number()
            .min(0)
            .max(1)
            .default(0.6),
    })
    .refine(
        ({ providers, defaultProvider, enabled }) =>
            !(enabled && providers[defaultProvider] === undefined),
        ({ defaultProvider }) => ({
            message: `Configuration for the default provider "${defaultProvider}" must be present`,
            params: {
                defaultProvider,
            },
            path: ['providers'],
        }),
    )
    .refine(
        ({
            providers,
            defaultEmbeddingModelProvider,
            enabled,
            embeddingEnabled,
        }) =>
            !(
                enabled &&
                embeddingEnabled &&
                providers[defaultEmbeddingModelProvider] === undefined
            ),
        ({ defaultEmbeddingModelProvider }) => ({
            message: `Configuration for the default embedding provider "${defaultEmbeddingModelProvider}" must be present`,
            params: {
                defaultEmbeddingModelProvider,
            },
            path: ['providers'],
        }),
    );

export type AiCopilotConfigSchemaType = z.infer<typeof aiCopilotConfigSchema>;
