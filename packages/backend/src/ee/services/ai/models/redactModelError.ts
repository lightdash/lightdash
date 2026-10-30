import {
    APICallError,
    wrapLanguageModel,
    type LanguageModel,
    type LanguageModelMiddleware,
} from 'ai';
import { z } from 'zod';
import { withImageRequestSizeGuard } from './requestSizeGuard';

const REDACTED = '[redacted binary payload]';
const OMITTED_SIZE_LIMIT = '[omitted: size limit]';
const imageDescriptor = z.union([
    z.object({
        type: z.enum([
            'image',
            'image_url',
            'input_image',
            'image-data',
            'image-url',
            'file-data',
            'base64',
            'Buffer',
        ]),
    }),
    z.object({ mediaType: z.string().startsWith('image/') }),
    z.object({ media_type: z.string().startsWith('image/') }),
    z.object({ mimeType: z.string().startsWith('image/') }),
    z.object({ mime_type: z.string().startsWith('image/') }),
]);
const binaryKeys = new Set([
    'image',
    'image_url',
    'imageUrl',
    'inlineData',
    'inline_data',
    'bytes',
    'base64',
]);

const createErrorContainer = (value: object) => {
    if (APICallError.isInstance(value))
        return new APICallError({
            message: 'Provider request failed',
            url: '',
            requestBodyValues: null,
            statusCode: value.statusCode,
            isRetryable: value.isRetryable,
        });
    if (value instanceof Error) return new Error('Model request failed');
    return Array.isArray(value) ? [] : {};
};

/** Keeps clean errors intact; sanitizes provider bodies, stacks, causes and custom properties before retries/logging. */
export const redactModelError = (error: unknown): unknown => {
    let changes = 0;
    let remaining = 1_000_000;
    const seen = new WeakSet<object>();
    const omit = (marker = REDACTED) => {
        changes += 1;
        return marker;
    };
    const visit = (value: unknown, depth = 0): unknown => {
        remaining -= 1;
        if (depth > 64 || remaining < 0) return omit(OMITTED_SIZE_LIMIT);
        if (typeof value === 'string') {
            const sanitized = value
                .replace(
                    /data:image\\?\/[^;,\s]+;base64,[A-Za-z0-9+/_=\\\s-]+/gi,
                    REDACTED,
                )
                .replace(
                    /(?:iVBORw0KGgo|\/9j\/|UklGR)[A-Za-z0-9+/_=\s-]+/g,
                    REDACTED,
                )
                .replace(/[A-Za-z0-9+/_-]{1024,}={0,2}/g, REDACTED);
            if (sanitized !== value) changes += 1;
            if (/^\s*[[{]/.test(sanitized)) {
                try {
                    const parsed: unknown = JSON.parse(sanitized);
                    const before = changes;
                    const result = visit(parsed, depth + 1);
                    if (changes !== before) return JSON.stringify(result);
                } catch {
                    // Non-JSON messages and stack traces still receive string-level scrubbing.
                }
            }
            return sanitized;
        }
        if (typeof value === 'symbol') {
            const description = visit(value.description, depth + 1);
            return typeof description === 'string' &&
                description !== value.description
                ? Symbol(description)
                : value;
        }
        if (
            value === null ||
            (typeof value !== 'object' && typeof value !== 'function')
        )
            return value;
        if (typeof value === 'function') return omit();
        if (
            Buffer.isBuffer(value) ||
            value instanceof ArrayBuffer ||
            ArrayBuffer.isView(value) ||
            value instanceof Blob
        )
            return omit();
        if (
            value instanceof Date &&
            Object.getPrototypeOf(value) === Date.prototype &&
            Reflect.ownKeys(value).length === 0
        )
            return value;
        if (
            value instanceof URL &&
            Object.getPrototypeOf(value) === URL.prototype &&
            Reflect.ownKeys(value).length === 0
        )
            return visit(value.href, depth + 1);
        if (seen.has(value)) return '[omitted circular reference]';
        seen.add(value);
        if (
            !(value instanceof Error) &&
            imageDescriptor.safeParse(value).success
        )
            return omit();
        if (Array.isArray(value) && value.length > remaining)
            return omit(OMITTED_SIZE_LIMIT);
        const prototype: unknown = Object.getPrototypeOf(value);
        if (
            !(value instanceof Error) &&
            !Array.isArray(value) &&
            prototype !== Object.prototype &&
            prototype !== null
        )
            return omit();
        const keys = Reflect.ownKeys(value);
        if (keys.length > remaining) return omit(OMITTED_SIZE_LIMIT);
        const clean = createErrorContainer(value);
        keys.filter((key) => !Array.isArray(value) || key !== 'length').forEach(
            (key) => {
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                let original: unknown = descriptor.value;
                let inaccessible = Boolean(descriptor.get || descriptor.set);
                if (value instanceof Error && key === 'stack') {
                    try {
                        original = value.stack;
                        inaccessible = false;
                    } catch {
                        /* Untrusted accessors are omitted. */
                    }
                }
                const binaryProperty =
                    typeof key === 'string' &&
                    binaryKeys.has(key) &&
                    (typeof original === 'string' ||
                        (original !== null && typeof original === 'object'));
                const sanitized =
                    inaccessible || binaryProperty
                        ? omit()
                        : visit(original, depth + 1);
                let sanitizedKey = key;
                const keyText = typeof key === 'symbol' ? key.description : key;
                const sanitizedText = visit(keyText, depth + 1);
                if (
                    typeof sanitizedText === 'string' &&
                    sanitizedText !== keyText
                ) {
                    sanitizedKey =
                        typeof key === 'symbol'
                            ? Symbol(sanitizedText)
                            : sanitizedText;
                }
                Object.defineProperty(clean, sanitizedKey, {
                    configurable: descriptor.configurable,
                    enumerable: descriptor.enumerable,
                    writable: descriptor.writable ?? true,
                    value: sanitized,
                });
            },
        );
        return clean;
    };
    try {
        const sanitized = visit(error);
        return changes === 0 ? error : sanitized;
    } catch {
        return new Error(
            'Provider error details were withheld because they could not be safely sanitized.',
        );
    }
};

export const modelErrorRedactionMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params }) =>
        withImageRequestSizeGuard(
            params.prompt.some(
                (message) =>
                    message.role !== 'system' &&
                    message.content.some(
                        (part) =>
                            part.type === 'file' &&
                            part.mediaType.startsWith('image/'),
                    ),
            ),
            async () => {
                try {
                    return await doGenerate();
                } catch (error) {
                    throw redactModelError(error);
                }
            },
        ),
    wrapStream: async ({ doStream, params }) =>
        withImageRequestSizeGuard(
            params.prompt.some(
                (message) =>
                    message.role !== 'system' &&
                    message.content.some(
                        (part) =>
                            part.type === 'file' &&
                            part.mediaType.startsWith('image/'),
                    ),
            ),
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
                                                      error: redactModelError(
                                                          value.error,
                                                      ),
                                                  }
                                                : value,
                                        );
                                } catch (error) {
                                    reader.releaseLock();
                                    controller.error(redactModelError(error));
                                }
                            },
                            async cancel(reason) {
                                await reader.cancel(reason);
                                reader.releaseLock();
                            },
                        }),
                    };
                } catch (error) {
                    throw redactModelError(error);
                }
            },
        ),
};

export const withModelErrorRedaction = (
    model: Exclude<LanguageModel, string>,
) => wrapLanguageModel({ model, middleware: modelErrorRedactionMiddleware });
