import { CallSettings } from 'ai';
import { ProviderOptionsMap } from './types';

export type ModelPresetProvider = 'openai' | 'anthropic' | 'bedrock';

export type ReasoningStyle = 'budget' | 'adaptive';

export type ModelPreset<P extends ModelPresetProvider> = {
    name: string;
    provider: P;
    modelId: string;
    displayName: string;
    description: string;
    contextWindowTokens: number;
    supportsReasoning: boolean;
    // How the provider exposes extended reasoning. 'budget' uses the original
    // `thinking.type: 'enabled'` + `budgetTokens` API; 'adaptive' uses the newer
    // `effort` API (required by Claude Opus 4.7+). Ignored unless supportsReasoning.
    reasoningStyle?: ReasoningStyle;
    callOptions: CallSettings;
    providerOptions: ProviderOptionsMap[P] | undefined;
};

export const MODEL_PRESETS: {
    openai: ModelPreset<'openai'>[];
    anthropic: ModelPreset<'anthropic'>[];
    bedrock: ModelPreset<'bedrock'>[];
} = {
    openai: [
        {
            name: 'gpt-5.4',
            provider: 'openai',
            modelId: 'gpt-5.4-2026-03-05',
            displayName: 'GPT-5.4',
            description: 'Latest GPT-5 reasoning model for agentic tasks',
            // Cap below the long-context pricing threshold for now:
            // https://developers.openai.com/api/docs/models/gpt-5.4
            contextWindowTokens: 265000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: true,
            },
        },
        {
            name: 'gpt-5.4-mini',
            provider: 'openai',
            modelId: 'gpt-5.4-mini-2026-03-17',
            displayName: 'GPT-5.4 Mini',
            description:
                'Fast and cost-effective GPT-5.4 model for simple tasks',
            contextWindowTokens: 400000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: true,
                reasoningEffort: 'medium',
            },
        },
        {
            name: 'gpt-5.2',
            provider: 'openai',
            modelId: 'gpt-5.2-2025-12-11',
            displayName: 'GPT-5.2',
            description: 'Flagship reasoning model for agentic tasks',
            contextWindowTokens: 400000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: true,
            },
        },
        {
            name: 'gpt-5.1',
            provider: 'openai',
            modelId: 'gpt-5.1-2025-11-13',
            displayName: 'GPT-5.1',
            description: 'Intelligent reasoning model',
            contextWindowTokens: 400000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: true,
            },
        },
        {
            name: 'gpt-5-mini',
            provider: 'openai',
            modelId: 'gpt-5-mini-2025-08-07',
            displayName: 'GPT-5 Mini',
            description: 'Fast and cost-effective model for simple tasks',
            contextWindowTokens: 400000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: true,
                reasoningEffort: 'minimal',
            },
        },
    ],
    anthropic: [
        {
            name: 'claude-opus-4-7',
            provider: 'anthropic',
            modelId: 'claude-opus-4-7',
            displayName: 'Claude Opus 4.7',
            description: 'Most intelligent model for complex tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            callOptions: {},
            providerOptions: undefined,
        },
        {
            name: 'claude-opus-4-6',
            provider: 'anthropic',
            modelId: 'claude-opus-4-6',
            displayName: 'Claude Opus 4.6',
            description: 'Previous generation Opus for complex tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-sonnet-4-6',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            displayName: 'Claude Sonnet 4.6',
            description: 'Balanced model for daily tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-opus-4-5',
            provider: 'anthropic',
            modelId: 'claude-opus-4-5-20251101',
            displayName: 'Claude Opus 4.5',
            description: 'Previous generation Opus for complex tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-sonnet-4-5',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-5-20250929',
            displayName: 'Claude Sonnet 4.5',
            description: 'Previous generation Sonnet for daily tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-haiku-4-5',
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5-20251001',
            displayName: 'Claude Haiku 4.5',
            description: 'Fastest model with near-frontier AI capabilities',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-sonnet-4',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-20250514',
            displayName: 'Claude Sonnet 4',
            description: 'Previous generation model with reasoning',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
    ],
    bedrock: [
        {
            name: 'claude-opus-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-opus-4-5-20251101-v1:0',
            displayName: 'Claude Opus 4.5',
            description: 'Most intelligent model for complex tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-sonnet-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
            displayName: 'Claude Sonnet 4.5',
            description: 'Balanced model for daily tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-haiku-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
            displayName: 'Claude Haiku 4.5',
            description: 'Fastest model with near-frontier AI capabilities',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        {
            name: 'claude-sonnet-4',
            provider: 'bedrock',
            modelId: 'anthropic.claude-sonnet-4-20250514-v1:0',
            displayName: 'Claude Sonnet 4',
            description: 'Previous generation model with reasoning',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
    ],
};

export function matchesPreset(
    preset: ModelPreset<ModelPresetProvider>,
    name: string,
): boolean {
    return preset.name === name || preset.modelId === name;
}

export function getModelPreset<T extends ModelPresetProvider>(
    provider: T,
    name: string,
): ModelPreset<T> | null {
    return (
        (MODEL_PRESETS[provider].find((p) => matchesPreset(p, name)) as
            | ModelPreset<T>
            | undefined) ?? null
    );
}

export type ModelProvider = keyof typeof MODEL_PRESETS;
