import {
    BaseCallbackHandler,
    type BaseCallbackHandlerInput,
} from '@langchain/core/callbacks/base';
import { type TokenUsage } from '@langchain/core/language_models/base';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LLMResult } from '@langchain/core/outputs';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI, ChatOpenAICallOptions } from '@langchain/openai';
import { sleep, UnexpectedServerError } from '@lightdash/common';

const DEFAULT_RETRY_TIMEOUT_MS = 5000;

class TokenUsageHandler extends BaseCallbackHandler {
    tokenUsage: TokenUsage | undefined;

    name = 'TokenUsageHandler';

    constructor(input?: BaseCallbackHandlerInput) {
        super(input);
        this.tokenUsage = undefined;
    }

    handleLLMEnd(output: LLMResult) {
        this.tokenUsage = output.llmOutput?.tokenUsage;
    }
}

export default class OpenAi {
    openAiApiKey: string | undefined;

    model: ChatOpenAI<ChatOpenAICallOptions> | undefined;

    constructor() {
        this.openAiApiKey = process.env.OPENAI_API_KEY;

        this.model = this.openAiApiKey
            ? new ChatOpenAI({
                  openAIApiKey: this.openAiApiKey,
                  modelName: 'gpt-4.1',
                  temperature: 0.2,
              })
            : undefined;
    }

    private async invokeOpenAI(
        chain: Runnable,
        inputVars: Record<string, string>,
        currentTry = 1,
    ): Promise<{ result: string; tokenUsage: TokenUsage | undefined }> {
        const stringOutputParser = new StringOutputParser();
        try {
            const tokenUsageHandler = new TokenUsageHandler();
            const result = await chain
                .pipe(stringOutputParser)
                .invoke(inputVars, {
                    callbacks: [tokenUsageHandler],
                });

            return {
                result,
                tokenUsage: tokenUsageHandler.tokenUsage,
            };
        } catch (e) {
            const status =
                e instanceof Error && 'status' in e
                    ? (e.status as Number)
                    : undefined;
            const headers =
                e instanceof Error && 'headers' in e
                    ? (e.headers as Record<string, string>)
                    : {};

            if (currentTry < 3 && status === 429) {
                const retryAfterMs =
                    Number(headers['retry-after-ms']) ??
                    DEFAULT_RETRY_TIMEOUT_MS;
                await sleep(retryAfterMs);
                return this.invokeOpenAI(chain, inputVars, currentTry + 1);
            }

            throw e;
        }
    }

    // TODO: improve inputVars type so that it depends on the prompt
    // TODO: use SequenceRunnable + ParallelRunnable to run multiple prompts in parallel
    async run(prompt: ChatPromptTemplate, inputVars: Record<string, string>) {
        if (!this.model) {
            throw new UnexpectedServerError('OpenAi model is not initialized');
        }
        const chain = prompt.pipe(this.model);
        return this.invokeOpenAI(chain, inputVars);
    }
}
