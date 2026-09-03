import { CallSettings } from 'ai';
import { ProviderOptionsMap } from './types';

export type ModelPresetProvider = 'openai' | 'anthropic' | 'bedrock';
export type SelectableModelProvider = ModelPresetProvider | 'openrouter';

export type ReasoningStyle = 'budget' | 'adaptive';

export type ModelPreset<P extends SelectableModelProvider> = {
    name: string;
    provider: P;
    modelId: string;
    displayName: string;
    description: string;
    groupLabel?: string;
    supportsReasoning: boolean;
    // How the provider exposes extended reasoning. 'budget' uses the original
    // `thinking.type: 'enabled'` + `budgetTokens` API; 'adaptive' uses the newer
    // `effort` API (required by Claude Opus 4.7+). Ignored unless supportsReasoning.
    reasoningStyle?: ReasoningStyle;
    // Excluded from model pickers unless the org's own provider key can access it
    hiddenUnlessKeyAccess?: boolean;
    // Kept resolvable for existing configurations, but hidden from new selections
    deprecated?: boolean;
    callOptions: CallSettings;
    providerOptions: ProviderOptionsMap[P] | undefined;
} & (
    | { custom?: false; contextWindowTokens: number }
    // Pass-through gateway models are the only ones whose window is unknown
    | { custom: true; contextWindowTokens: null }
);

export const MODEL_PRESETS: {
    openai: ModelPreset<'openai'>[];
    anthropic: ModelPreset<'anthropic'>[];
    bedrock: ModelPreset<'bedrock'>[];
} = {
    openai: [
        {
            name: 'gpt-5.6-sol',
            provider: 'openai',
            modelId: 'gpt-5.6-sol',
            displayName: 'GPT-5.6 Sol',
            description: 'Frontier model for complex professional work',
            contextWindowTokens: 1050000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
            },
        },
        {
            name: 'gpt-5.6-luna',
            provider: 'openai',
            modelId: 'gpt-5.6-luna',
            displayName: 'GPT-5.6 Luna',
            description: 'Fast, cost-effective model for lightweight tasks',
            contextWindowTokens: 1050000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
            },
        },
        {
            name: 'gpt-5.5',
            provider: 'openai',
            modelId: 'gpt-5.5-2026-04-23',
            displayName: 'GPT-5.5',
            description: 'Newest frontier model for complex professional work',
            // Cap below the long-context pricing threshold for now:
            // https://developers.openai.com/api/docs/models/gpt-5.5
            contextWindowTokens: 265000,
            supportsReasoning: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
            },
        },
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
                parallelToolCalls: false,
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
            deprecated: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
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
            deprecated: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
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
            deprecated: true,
            callOptions: {},
            providerOptions: {
                // strictJsonSchema: provider default is true
                parallelToolCalls: false,
                reasoningEffort: 'minimal',
            },
        },
    ],
    anthropic: [
        {
            name: 'claude-sonnet-5',
            provider: 'anthropic',
            modelId: 'claude-sonnet-5',
            displayName: 'Claude Sonnet 5',
            description: 'Newest Sonnet model balancing speed and intelligence',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            callOptions: {},
            providerOptions: undefined,
        },
        {
            name: 'claude-opus-5',
            provider: 'anthropic',
            modelId: 'claude-opus-5',
            displayName: 'Claude Opus 5',
            description:
                'Most intelligent Opus model for complex agentic coding and enterprise work',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            callOptions: {},
            providerOptions: undefined,
        },
        {
            name: 'claude-opus-4-8',
            provider: 'anthropic',
            modelId: 'claude-opus-4-8',
            displayName: 'Claude Opus 4.8',
            description: 'Previous generation Opus for complex tasks',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            hiddenUnlessKeyAccess: true,
            callOptions: {},
            providerOptions: undefined,
        },
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
            deprecated: true,
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
            deprecated: true,
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
            deprecated: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
    ],
    bedrock: [
        {
            name: 'claude-sonnet-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-sonnet-5',
            displayName: 'Claude Sonnet 5',
            description: 'Newest Sonnet model balancing speed and intelligence',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            callOptions: {},
            providerOptions: undefined,
        },
        {
            name: 'claude-opus-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-opus-5',
            displayName: 'Claude Opus 5',
            description:
                'Most intelligent Opus model for complex agentic coding and enterprise work',
            contextWindowTokens: 200000,
            supportsReasoning: true,
            reasoningStyle: 'adaptive',
            callOptions: {},
            providerOptions: undefined,
        },
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
            deprecated: true,
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
            deprecated: true,
            callOptions: { temperature: 0.2 },
            providerOptions: undefined,
        },
    ],
};

// Pass-through preset for model names served by an OpenAI-compatible gateway
// (e.g. LiteLLM's "bedrock/eu.anthropic.claude-sonnet-4-6") that don't exist
// in the preset table. The name is sent to the endpoint verbatim.
export function customGatewayPreset(modelName: string): ModelPreset<'openai'> {
    return {
        name: modelName,
        provider: 'openai',
        modelId: modelName,
        displayName: modelName,
        description: 'Custom model served by the configured OpenAI endpoint',
        custom: true,
        contextWindowTokens: null,
        supportsReasoning: false,
        callOptions: {},
        providerOptions: undefined,
    };
}

const OPENROUTER_MODEL_METADATA: Record<
    string,
    {
        displayName: string;
        description: string;
        groupLabel: string;
        contextWindowTokens: number;
        supportsReasoning: boolean;
    }
> = {
    'qwen/qwen3.5-9b': {
        displayName: 'Qwen3.5 9B',
        description:
            'Compact multimodal model for affordable reasoning, coding, and visual analysis',
        groupLabel: 'Qwen',
        contextWindowTokens: 262_144,
        supportsReasoning: false,
    },
    'moonshotai/kimi-k3': {
        displayName: 'Kimi K3',
        description:
            'Open-weight multimodal model for complex coding and long-running agents',
        groupLabel: 'Moonshot AI',
        contextWindowTokens: 1_048_576,
        supportsReasoning: false,
    },
    'minimax/minimax-m3': {
        displayName: 'MiniMax M3',
        description:
            'Multimodal 1M-context model for coding and long-horizon agent work',
        groupLabel: 'MiniMax',
        contextWindowTokens: 1_048_576,
        supportsReasoning: false,
    },
    'deepseek/deepseek-v4-flash-0731': {
        displayName: 'DeepSeek V4 Flash',
        description:
            'Fast mixture-of-experts reasoning for coding and tool-driven workflows',
        groupLabel: 'DeepSeek',
        contextWindowTokens: 1_310_720,
        supportsReasoning: false,
    },
    'z-ai/glm-5.3-flash': {
        displayName: 'GLM 5.3 Flash',
        description:
            'Efficient multimodal model for coding and long-context agent tasks',
        groupLabel: 'Z.ai',
        contextWindowTokens: 1_310_720,
        supportsReasoning: false,
    },
};

export function openRouterPreset(modelName: string): ModelPreset<'openrouter'> {
    const metadata = OPENROUTER_MODEL_METADATA[modelName];

    if (metadata) {
        return {
            name: modelName,
            provider: 'openrouter',
            modelId: modelName,
            ...metadata,
            custom: false,
            callOptions: {},
            providerOptions: undefined,
        };
    }

    return {
        name: modelName,
        provider: 'openrouter',
        modelId: modelName,
        displayName: modelName,
        description: 'Model served through OpenRouter',
        custom: true,
        contextWindowTokens: null,
        supportsReasoning: false,
        callOptions: {},
        providerOptions: undefined,
    };
}

export function matchesPreset(
    preset: ModelPreset<SelectableModelProvider>,
    name: string,
): boolean {
    return preset.name === name || preset.modelId === name;
}

// Whether a provider's /v1/models listing grants access to a base model id.
// Matches the exact id or a dated variant of it — e.g. "claude-opus-4-8" is
// granted by "claude-opus-4-8" or "claude-opus-4-8-20260115", but not by
// "claude-opus-4-80".
export function keyGrantsModel(
    accessibleModelIds: readonly string[],
    baseModelId: string,
): boolean {
    return accessibleModelIds.some(
        (id) => id === baseModelId || id.startsWith(`${baseModelId}-`),
    );
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
