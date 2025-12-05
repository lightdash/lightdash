import { CallSettings } from 'ai';
import { ProviderOptionsMap } from './types';

export type ModelPresetProvider = 'openai' | 'anthropic' | 'bedrock';

export type ModelPreset<P extends ModelPresetProvider> = {
    name: string;
    provider: P;
    modelId: string;
    displayName: string;
    description: string;
    supportsReasoning: boolean;
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
            name: 'gpt-5.1',
            provider: 'openai',
            modelId: 'gpt-5.1-2025-11-13',
            displayName: 'GPT-5.1',
            description: 'Intelligent reasoning model',
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: {
                strictJsonSchema: true,
                parallelToolCalls: false,
            },
        },
        {
            name: 'gpt-4.1',
            provider: 'openai',
            modelId: 'gpt-4.1-2025-04-14',
            displayName: 'GPT-4.1',
            description: 'Smartest non-reasoning model',
            supportsReasoning: false,
            callOptions: { temperature: 0.2 },
            providerOptions: {
                strictJsonSchema: true,
                parallelToolCalls: false,
            },
        },
    ],
    anthropic: [
        {
            name: 'claude-sonnet-4-5',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-5-20250929',
            displayName: 'Claude Sonnet 4.5',
            description: 'Most capable model for daily tasks',
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        // {
        //     name: 'claude-opus-4-5',
        //     provider: 'anthropic',
        //     modelId: 'claude-opus-4-5-20251101',
        //     displayName: 'Claude Opus 4.5',
        //     description: 'Most capable Anthropic model with reasoning',
        //     supportsReasoning: true,
        //     callOptions: { temperature: 0.2 },
        //     providerOptions: undefined,
        // },
        {
            name: 'claude-haiku-4-5',
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5-20251001',
            displayName: 'Claude Haiku 4.5',
            description: 'Fastest model with near-frontier AI capabilities',
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
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
    ],
    bedrock: [
        {
            name: 'claude-sonnet-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
            displayName: 'Claude Sonnet 4.5',
            description: 'Most capable model for daily tasks',
            supportsReasoning: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
        // {
        //     name: 'claude-opus-4-5',
        //     provider: 'bedrock',
        //     modelId: 'anthropic.claude-opus-4-5-20251101-v1:0',
        //     displayName: 'Claude Opus 4.5',
        //     description: 'Most capable model for daily tasks',
        //     supportsReasoning: true,
        //     callOptions: { temperature: 0.2 },
        //     providerOptions: undefined,
        // },
        {
            name: 'claude-haiku-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
            displayName: 'Claude Haiku 4.5',
            description: 'Fastest model with near-frontier AI capabilities',
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
