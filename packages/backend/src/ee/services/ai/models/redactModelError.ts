import {
    APICallError,
    wrapLanguageModel,
    type LanguageModel,
    type LanguageModelMiddleware,
} from 'ai';
import { hasBinaryModelInputs } from '../utils/aiCallTelemetry';
import { withImageRequestSizeGuard } from './requestSizeGuard';

/**
 * A provider error carries the whole request it failed on, attached images
 * included, and that field is what reaches JSON logs. Everything else on the
 * error (status, retryability, provider message and code) is kept.
 */
export const redactModelError = (error: unknown): unknown => {
    if (!APICallError.isInstance(error)) return error;
    const clean = new APICallError({
        message: error.message,
        url: error.url,
        requestBodyValues: null,
        statusCode: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
        cause: error.cause,
        isRetryable: error.isRetryable,
        data: error.data,
    });
    clean.stack = error.stack;
    return clean;
};

type ModelPrompt = Parameters<
    NonNullable<LanguageModelMiddleware['wrapGenerate']>
>[0]['params']['prompt'];

const hasImageInput = (prompt: ModelPrompt) =>
    prompt.some(
        (message) =>
            message.role !== 'system' &&
            message.content.some(
                (part) =>
                    part.type === 'file' && part.mediaType.startsWith('image/'),
            ),
    );

// Text-only calls keep their request body on the error for debugging.
const errorRedactorFor = (prompt: ModelPrompt) =>
    hasBinaryModelInputs(prompt)
        ? redactModelError
        : (error: unknown): unknown => error;

export const modelErrorRedactionMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params }) => {
        const redact = errorRedactorFor(params.prompt);
        return withImageRequestSizeGuard(
            hasImageInput(params.prompt),
            async () => {
                try {
                    return await doGenerate();
                } catch (error) {
                    throw redact(error);
                }
            },
        );
    },
    wrapStream: async ({ doStream, params }) => {
        const redact = errorRedactorFor(params.prompt);
        return withImageRequestSizeGuard(
            hasImageInput(params.prompt),
            async () => {
                try {
                    const result = await doStream();
                    const reader = result.stream.getReader();
                    type Part = NonNullable<
                        Awaited<ReturnType<typeof reader.read>>['value']
                    >;
                    return {
                        ...result,
                        stream: new ReadableStream<Part>({
                            async pull(controller) {
                                try {
                                    const { value, done } = await reader.read();
                                    if (done) {
                                        reader.releaseLock();
                                        controller.close();
                                    } else
                                        controller.enqueue(
                                            value.type === 'error'
                                                ? {
                                                      ...value,
                                                      error: redact(
                                                          value.error,
                                                      ),
                                                  }
                                                : value,
                                        );
                                } catch (error) {
                                    reader.releaseLock();
                                    controller.error(redact(error));
                                }
                            },
                            async cancel(reason) {
                                await reader.cancel(reason);
                                reader.releaseLock();
                            },
                        }),
                    };
                } catch (error) {
                    throw redact(error);
                }
            },
        );
    },
};

export const withModelErrorRedaction = (
    model: Exclude<LanguageModel, string>,
) => wrapLanguageModel({ model, middleware: modelErrorRedactionMiddleware });
