import { AsyncLocalStorage } from 'node:async_hooks';
import Logger from '../../../../logging/logger';
import { type AiProvider } from './types';

// Application ceilings, in decimal bytes. Gateways may impose lower limits.
// Claude: https://platform.claude.com/docs/en/api/overview#request-size-limits
// Gemini: https://ai.google.dev/gemini-api/docs/image-understanding
// OpenAI: https://developers.openai.com/api/docs/guides/images-vision
// Bedrock Claude is documented at 20 MB by Anthropic, below InvokeModel's 25 MB.
// Custom OpenAI/Anthropic gateways, Azure and Vertex use the conservative Gemini ceiling.
export const IMAGE_MODEL_GATEWAY_REQUEST_MAX_BYTES = 20_000_000;
export const IMAGE_MODEL_REQUEST_MAX_BYTES = {
    anthropic: 32_000_000,
    google: 20_000_000,
    vertex: 20_000_000,
    bedrock: 20_000_000,
    openai: 512_000_000,
    azure: 20_000_000,
    openrouter: 20_000_000,
} satisfies Record<AiProvider, number>;

export class AiModelRequestTooLargeError extends Error {
    constructor(
        readonly bytes: number,
        readonly maxBytes: number,
    ) {
        super(
            'This conversation is too large to send with images. Remove images from this message or start a new conversation.',
        );
        this.name = 'AiModelRequestTooLargeError';
    }
}

const imageRequest = new AsyncLocalStorage<boolean>();
let warnedUnmeasurableBody = false;

export const withImageRequestSizeGuard = <T>(
    hasImages: boolean,
    run: () => Promise<T>,
) => imageRequest.run(hasImages, run);

const bodyByteLength = (
    body: BodyInit | null | undefined,
): number | undefined => {
    if (typeof body === 'string') return Buffer.byteLength(body);
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    if (body instanceof Blob) return body.size;
    if (body instanceof URLSearchParams)
        return Buffer.byteLength(body.toString());
    // Language providers currently send JSON; do not buffer unrelated multipart/streaming bodies.
    return undefined;
};

/** Measures the final provider body, after tools, system text, history and image encoding. */
export const createRequestSizeGuardedFetch =
    (
        maxBytes: number,
        baseFetch: typeof globalThis.fetch = (...args) =>
            globalThis.fetch(...args),
    ): typeof globalThis.fetch =>
    async (input, init) => {
        const bytes = bodyByteLength(init?.body);
        if (
            imageRequest.getStore() &&
            bytes === undefined &&
            !warnedUnmeasurableBody
        ) {
            warnedUnmeasurableBody = true;
            Logger.warn(
                'Could not measure an image model request body; provider request-size limits may apply.',
            );
        }
        if (
            imageRequest.getStore() &&
            bytes !== undefined &&
            bytes > maxBytes
        ) {
            throw new AiModelRequestTooLargeError(bytes, maxBytes);
        }
        return baseFetch(input, init);
    };
