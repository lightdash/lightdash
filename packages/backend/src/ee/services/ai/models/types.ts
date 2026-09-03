import { BedrockProviderOptions } from '@ai-sdk/amazon-bedrock';
import { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { JSONValue, LanguageModel, type CallSettings } from 'ai';
import { AiKeyManagement } from '../../../../analytics/aiUsage';
import { AiCopilotConfigSchemaType } from '../../../../config/aiConfigSchema';
import { AiCallAttribution } from '../utils/aiCallTelemetry';

export type AiProvider = keyof AiCopilotConfigSchemaType['providers'];

export type ProviderOptionsMap = {
    openai: OpenAIResponsesProviderOptions;
    azure: OpenAIResponsesProviderOptions;
    anthropic: Omit<AnthropicProviderOptions, 'fallbacks'>;
    openrouter: Record<string, JSONValue>;
    bedrock: BedrockProviderOptions;
};

export type AiModel<P extends AiProvider> = {
    model: Exclude<LanguageModel, string>;
    callOptions: CallSettings;
    providerOptions:
        | {
              [K in P]: ProviderOptionsMap[K];
          }
        | undefined;
};

/**
 * Options for generator functions (generateObject calls).
 * Subset of AiModel used by lightweight generation tasks.
 */
export type GeneratorModelOptions = {
    model: LanguageModel;
    callOptions?: CallSettings;
    providerOptions?: Record<string, Record<string, JSONValue>>;
    // Attribution stamped on the AI-call span (org/project/user). Set at the
    // construction point where that context is in scope; read via
    // getGeneratorTelemetry. See utils/aiCallTelemetry.
    telemetry?: AiCallAttribution;
    // The key origin for the model: a Lightdash-managed key or a self-managed
    // (BYO) key. This field is necessary, but it can be null. The model builder
    // sets it. getGeneratorTelemetry reads it. Use null only for a path that
    // does not record the key origin.
    keyManagement: AiKeyManagement | null;
};
