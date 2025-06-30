import { z } from 'zod';

export const DEFAULT_OPENAI_MODEL_NAME = 'gpt-4.1';
export const DEFAULT_ANTHROPIC_MODEL_NAME = 'claude-4-sonnet-20250514';
export const DEFAULT_DEFAULT_AI_PROVIDER = 'openai';

export const aiCopilotConfigSchema = z
    .object({
        defaultProvider: z
            .enum(['openai', 'azure', 'anthropic'])
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
        }),
        enabled: z.boolean(),
        requiresFeatureFlag: z.boolean(),
        embeddingSearchEnabled: z.boolean(),
        telemetryEnabled: z.boolean(),
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
