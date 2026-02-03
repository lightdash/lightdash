import { BedrockProviderOptions } from '@ai-sdk/amazon-bedrock';
import { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { JSONValue, LanguageModel, type CallSettings } from 'ai';
import { AiCopilotConfigSchemaType } from '../../../../config/aiConfigSchema';

export type AiProvider = keyof AiCopilotConfigSchemaType['providers'];

export type ProviderOptionsMap = {
    openai: OpenAIResponsesProviderOptions;
    azure: OpenAIResponsesProviderOptions;
    anthropic: AnthropicProviderOptions;
    openrouter: Record<string, JSONValue>;
    bedrock: BedrockProviderOptions;
    gemini: GoogleGenerativeAIProviderOptions;
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
