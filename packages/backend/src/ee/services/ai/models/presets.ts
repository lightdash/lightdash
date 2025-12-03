import { CallSettings } from 'ai';
import { ProviderOptionsMap } from './types';

export type ModelPreset<P extends 'openai' | 'anthropic' | 'bedrock'> = {
    provider: P;
    modelId: string;
    displayName: string;
    description: string;
    supportsReasoning: boolean;
    callOptions: CallSettings;
    providerOptions: ProviderOptionsMap[P] | undefined;
};

export const MODEL_PRESETS: Record<
    string,
    ModelPreset<'openai'> | ModelPreset<'anthropic'> | ModelPreset<'bedrock'>
> = {
    // OpenAI models
    'gpt-5.1-2025-11-13': {
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
    'gpt-4.1-2025-04-14': {
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

    // Anthropic models
    'claude-sonnet-4-5-20250929': {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude Sonnet 4.5',
        description: 'Most capable model for daily tasks',
        supportsReasoning: true,
        callOptions: { temperature: 0.2 },
        providerOptions: undefined,
    },
    // 'claude-opus-4-5-20251101': {
    //     provider: 'anthropic',
    //     modelId: 'claude-opus-4-5-20251101',
    //     displayName: 'Claude Opus 4.5',
    //     description: 'Most capable Anthropic model with reasoning',
    //     supportsReasoning: true,
    //     callOptions: { temperature: 0.2 },
    //     providerOptions: undefined,
    // },
    'claude-haiku-4-5-20251001': {
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        displayName: 'Claude Haiku 4.5',
        description: 'Fastest model with near-frontier AI capabilities',
        supportsReasoning: true,
        callOptions: { temperature: 0.2 },
        providerOptions: undefined,
    },

    // Bedrock models
    'anthropic.claude-sonnet-4-5-20250929-v1:0': {
        provider: 'bedrock',
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        displayName: 'Claude Sonnet 4.5 (Bedrock)',
        description: 'Most capable model for daily tasks',
        supportsReasoning: true,
        callOptions: { temperature: 0.2 },
        providerOptions: undefined,
    },
    // 'anthropic.claude-opus-4-5-20251101-v1:0': {
    //     provider: 'bedrock',
    //     modelId: 'anthropic.claude-opus-4-5-20251101-v1:0',
    //     displayName: 'Claude Opus 4.5 (Bedrock)',
    //     description: 'Most capable model for daily tasks',
    //     supportsReasoning: true,
    //     callOptions: { temperature: 0.2 },
    //     providerOptions: undefined,
    // },
    'anthropic.claude-haiku-4-5-20251001-v1:0': {
        provider: 'bedrock',
        modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        displayName: 'Claude Haiku 4.5 (Bedrock)',
        description: 'Fastest model with near-frontier AI capabilities',
        supportsReasoning: true,
        callOptions: { temperature: 0.2 },
        providerOptions: undefined,
    },
};

export type ModelPresetId = keyof typeof MODEL_PRESETS;
