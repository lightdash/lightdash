import type { Request, RequestHandler, Response } from 'express';
import zlib from 'zlib';
import { lightdashConfig } from '../../config/lightdashConfig';
import Logger from '../../logging/logger';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;
export const RESPONSE_COMPRESSION_MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const RESPONSE_COMPRESSION_MAX_IN_FLIGHT_BYTES = 128 * 1024 * 1024;

type ResponseEncoding = 'br' | 'gzip';
type ContentCoding = ResponseEncoding | 'identity';

type ResponseCompressionOptions = {
    maxChunkBytes?: number;
    maxInFlightBytes?: number;
};

const toPromise = (
    run: (callback: (error: Error | null, result: Buffer) => void) => void,
) =>
    new Promise<Buffer>((resolve, reject) => {
        run((error, result) => (error ? reject(error) : resolve(result)));
    });

export const compressionChunkSize = (
    bodyLength: number,
    maxChunkBytes = RESPONSE_COMPRESSION_MAX_CHUNK_BYTES,
) =>
    Math.min(
        maxChunkBytes,
        Math.max(zlib.constants.Z_DEFAULT_CHUNK, Math.ceil(bodyLength / 4)),
    );

const encoders: Record<
    ResponseEncoding,
    (body: Buffer, chunkSize: number) => Promise<Buffer>
> = {
    br: (body, chunkSize) =>
        toPromise((callback) =>
            zlib.brotliCompress(
                body,
                {
                    chunkSize,
                    params: {
                        [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
                        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
                    },
                },
                callback,
            ),
        ),
    gzip: (body, chunkSize) =>
        toPromise((callback) =>
            zlib.gzip(body, { level: 1, chunkSize }, callback),
        ),
};

const jsonContentTypePattern = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

const isJsonResponse = (res: Response) => {
    const contentType = res.getHeader('Content-Type');
    return (
        typeof contentType === 'string' &&
        jsonContentTypePattern.test(contentType)
    );
};

const CODING_PREFERENCE: ContentCoding[] = ['br', 'gzip', 'identity'];

const parseAcceptEncoding = (header: string | undefined) =>
    (header ?? '').split(',').reduce((weights, entry) => {
        const [name, ...params] = entry.split(';').map((part) => part.trim());
        const qParam = params.find((param) => /^q=/i.test(param));
        const weight = qParam === undefined ? 1 : Number(qParam.slice(2));
        if (name && Number.isFinite(weight)) {
            weights.set(name.toLowerCase(), Math.min(Math.max(weight, 0), 1));
        }
        return weights;
    }, new Map<string, number>());

const acceptableCodings = (req: Request): ContentCoding[] => {
    const weights = parseAcceptEncoding(req.headers['accept-encoding']);
    const weightOf = (coding: ContentCoding) =>
        weights.get(coding) ??
        weights.get('*') ??
        (coding === 'identity' ? Number.MIN_VALUE : 0);
    return CODING_PREFERENCE.map((coding) => ({
        coding,
        weight: weightOf(coding),
    }))
        .filter(({ weight }) => weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map(({ coding }) => coding);
};

const isCommitted = (res: Response) =>
    res.headersSent || res.writableEnded || res.destroyed;

const sendNotAcceptable = (res: Response) => {
    res.status(406);
    res.removeHeader('Content-Type');
    res.removeHeader('ETag');
    res.setHeader('Content-Length', '0');
    res.end();
};

export const createResponseCompression = ({
    maxChunkBytes = RESPONSE_COMPRESSION_MAX_CHUNK_BYTES,
    maxInFlightBytes = RESPONSE_COMPRESSION_MAX_IN_FLIGHT_BYTES,
}: ResponseCompressionOptions = {}): RequestHandler => {
    let inFlightBytes = 0;

    const encode = async (encoding: ResponseEncoding, body: Buffer) => {
        inFlightBytes += body.length;
        try {
            return await encoders[encoding](
                body,
                compressionChunkSize(body.length, maxChunkBytes),
            );
        } finally {
            inFlightBytes -= body.length;
        }
    };

    const isOverBudget = (body: Buffer) =>
        inFlightBytes > 0 && inFlightBytes + body.length > maxInFlightBytes;

    return (req, res, next) => {
        res.vary('Accept-Encoding');
        const send = res.send.bind(res);
        let latestSend = 0;

        const commitEncoded = (encoding: ResponseEncoding, encoded: Buffer) => {
            const generateETag = req.app.get('etag fn') as
                | ((value: Buffer) => string)
                | undefined;
            if (generateETag && res.getHeader('ETag') === undefined) {
                res.setHeader('ETag', generateETag(encoded));
            }
            if (!req.fresh) {
                res.setHeader('Content-Encoding', encoding);
            }
            send(encoded);
        };

        const sendWith = async (
            sendId: number,
            body: Buffer,
            codings: ContentCoding[],
        ): Promise<void> => {
            const ownsResponse = () =>
                sendId === latestSend && !isCommitted(res);
            if (!ownsResponse()) return;
            const [coding, ...fallbacks] = codings;
            if (coding === undefined) {
                sendNotAcceptable(res);
                return;
            }
            if (coding === 'identity') {
                send(body);
                return;
            }
            let encoded: Buffer;
            try {
                encoded = await encode(coding, body);
            } catch (error) {
                Logger.warn('Response compression failed', {
                    error,
                    encoding: coding,
                });
                await sendWith(
                    sendId,
                    body,
                    fallbacks.includes('identity') ? ['identity'] : fallbacks,
                );
                return;
            }
            if (ownsResponse()) commitEncoded(coding, encoded);
        };

        res.send = (body?: unknown) => {
            if (
                (typeof body !== 'string' && !Buffer.isBuffer(body)) ||
                res.getHeader('Content-Encoding') !== undefined ||
                !isJsonResponse(res)
            ) {
                return send(body);
            }
            const codings = acceptableCodings(req);
            const identityAcceptable = codings.includes('identity');
            const bytes = typeof body === 'string' ? Buffer.from(body) : body;
            if (
                identityAcceptable &&
                (codings[0] === 'identity' ||
                    bytes.length < RESPONSE_COMPRESSION_THRESHOLD_BYTES ||
                    isOverBudget(bytes))
            ) {
                return send(body);
            }
            latestSend += 1;
            sendWith(latestSend, bytes, codings).catch((error: unknown) => {
                Logger.error('Response compression could not send', {
                    error,
                });
                if (!res.writableEnded) res.destroy();
            });
            return res;
        };
        next();
    };
};

const resultsPageCompression = createResponseCompression();

export const compressResultsPage: RequestHandler = (req, res, next) => {
    if (!lightdashConfig.httpServer.responseCompressionEnabled) {
        next();
        return;
    }
    resultsPageCompression(req, res, next);
};
