import { JSONValue, LanguageModel } from 'ai';

export type AiModel<P extends string> = {
    model: Exclude<LanguageModel, string>;
    callOptions: { temperature: number };
    providerOptions:
        | {
              [K in P]: Record<string, JSONValue>;
          }
        | undefined;
};
