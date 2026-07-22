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
    anthropic: AnthropicProviderOptions;
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
    // Whether the model runs on a Lightdash-managed or self-managed (BYO) key.
    // Stamped by the model builder and rides along when the builder result is
    // spread into modelOptions; read by getGeneratorTelemetry.
    keyManagement?: AiKeyManagement | null;
};
