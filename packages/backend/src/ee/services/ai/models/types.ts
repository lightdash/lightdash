import { SchemaCompatLayer } from '@mastra/schema-compat';
import { JSONValue, LanguageModel } from 'ai';

export type AiModel<P extends string> = {
    model: Exclude<LanguageModel, string>;
    schemaCompatibilityLayers: SchemaCompatLayer[] | null;
    callOptions: { temperature: number };
    providerOptions:
        | {
              [K in P]: Record<string, JSONValue>;
          }
        | undefined;
};
