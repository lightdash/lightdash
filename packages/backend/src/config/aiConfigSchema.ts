import { z } from 'zod';

export const DEFAULT_OPENAI_MODEL_NAME = 'gpt-4.1-2025-04-14';
export const DEFAULT_ANTHROPIC_MODEL_NAME = 'claude-sonnet-4-20250514';
export const DEFAULT_DEFAULT_AI_PROVIDER = 'openai';
export const DEFAULT_OPENROUTER_MODEL_NAME = 'openai/gpt-4.1-2025-04-14';
export const DEFAULT_BEDROCK_MODEL_NAME =
    'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

export const aiCopilotConfigSchema = z
    .object({
        defaultProvider: z
            .enum(['openai', 'azure', 'anthropic', 'openrouter', 'bedrock'])
            .default('openai'),
        providers: z.object({
            openai: z
                .object({
                    apiKey: z.string(),
                    modelName: z.string().default(DEFAULT_OPENAI_MODEL_NAME),
                    baseUrl: z.string().optional(),
                    temperature: z.number().min(0).max(2).default(0.2),
                    responsesApi: z.boolean().default(false),
                    reasoning: z
                        .object({
                            enabled: z.boolean().default(false),
                            reasoningSummary: z
                                .enum(['auto', 'detailed'])
                                .default('auto'),
                            reasoningEffort: z
                                .enum(['minimal', 'low', 'medium', 'high'])
                                .default('medium'),
                        })
                        .optional()
                        .default({
                            enabled: false,
                            reasoningSummary: 'auto',
                            reasoningEffort: 'low',
                        }),
                })
                .optional(),
            azure: z
                .object({
                    endpoint: z.string(),
                    apiKey: z.string(),
                    apiVersion: z.string(),
                    deploymentName: z.string(),
                    temperature: z.number().min(0).max(2).default(0.2),
                })
                .optional(),
            anthropic: z
                .object({
                    apiKey: z.string(),
                    modelName: z.string().default(DEFAULT_ANTHROPIC_MODEL_NAME),
                    temperature: z.number().min(0).max(2).default(0.2),
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
                    temperature: z.number().min(0).max(2).default(0.2),
                })
                .optional(),
            bedrock: z
                .union([
                    z.object({
                        apiKey: z.string(),
                        region: z.string().optional(),
                        modelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_MODEL_NAME),
                        temperature: z.number().min(0).max(2).default(0.2),
                    }),
                    z.object({
                        region: z.string(),
                        accessKeyId: z.string(),
                        secretAccessKey: z.string(),
                        sessionToken: z.string().optional(),
                        modelName: z
                            .string()
                            .default(DEFAULT_BEDROCK_MODEL_NAME),
                        temperature: z.number().min(0).max(2).default(0.2),
                    }),
                ])
                .optional(),
        }),
        enabled: z.boolean(),
        requiresFeatureFlag: z.boolean(),
        telemetryEnabled: z.boolean(),
        debugLoggingEnabled: z.boolean(),
        askAiButtonEnabled: z.boolean(),
        maxQueryLimit: z.number().positive(),
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
    );

export type AiCopilotConfigSchemaType = z.infer<typeof aiCopilotConfigSchema>;
