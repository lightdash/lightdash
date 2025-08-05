import { z } from 'zod';

export const DEFAULT_OPENAI_MODEL_NAME = 'gpt-4.1';
export const DEFAULT_ANTHROPIC_MODEL_NAME = 'claude-4-sonnet-20250514';
export const DEFAULT_DEFAULT_AI_PROVIDER = 'openai';
export const DEFAULT_OPENROUTER_MODEL_NAME = 'openai/gpt-4.1-2025-04-14';

export const aiCopilotConfigSchema = z
    .object({
        defaultProvider: z
            .enum(['openai', 'azure', 'anthropic', 'openrouter'])
            .default('openai'),
        providers: z.object({
            openai: z
                .object({
                    apiKey: z.string(),
                    modelName: z.string().default(DEFAULT_OPENAI_MODEL_NAME),
                    baseUrl: z.string().optional(),
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
        }),
        enabled: z.boolean(),
        requiresFeatureFlag: z.boolean(),
        telemetryEnabled: z.boolean(),
        debugLoggingEnabled: z.boolean(),
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
