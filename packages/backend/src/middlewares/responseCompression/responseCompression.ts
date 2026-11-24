import type { Request, RequestHandler, Response } from 'express';
import zlib from 'zlib';
import { lightdashConfig } from '../../config/lightdashConfig';
import Logger from '../../logging/logger';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;

type ResponseEncoding = 'br' | 'gzip';

const toPromise = (
    run: (callback: (error: Error | null, result: Buffer) => void) => void,
) =>
    new Promise<Buffer>((resolve, reject) => {
        run((error, result) => (error ? reject(error) : resolve(result)));
    });

const chunkSizeFor = (body: Buffer) =>
    Math.max(zlib.constants.Z_DEFAULT_CHUNK, Math.ceil(body.length / 4));

const encoders: Record<ResponseEncoding, (body: Buffer) => Promise<Buffer>> = {
    br: (body) =>
        toPromise((callback) =>
            zlib.brotliCompress(
                body,
                {
                    chunkSize: chunkSizeFor(body),
                    params: {
                        [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
                        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
                    },
                },
                callback,
            ),
        ),
    gzip: (body) =>
        toPromise((callback) =>
            zlib.gzip(
                body,
                { level: 1, chunkSize: chunkSizeFor(body) },
                callback,
            ),
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

const negotiateEncoding = (req: Request): ResponseEncoding | undefined => {
    if (req.acceptsEncodings('br') === 'br') return 'br';
    if (req.acceptsEncodings('gzip') === 'gzip') return 'gzip';
    return undefined;
};

export const createResponseCompression =
    (): RequestHandler => (req, res, next) => {
        res.vary('Accept-Encoding');
        const send = res.send.bind(res);
        res.send = (body?: unknown) => {
            const encoding = negotiateEncoding(req);
            if (
                encoding === undefined ||
                (typeof body !== 'string' && !Buffer.isBuffer(body)) ||
                res.getHeader('Content-Encoding') !== undefined ||
                !isJsonResponse(res)
            ) {
                return send(body);
            }
            const bytes = typeof body === 'string' ? Buffer.from(body) : body;
            if (bytes.length < RESPONSE_COMPRESSION_THRESHOLD_BYTES) {
                return send(body);
            }
            encoders[encoding](bytes).then(
                (encoded) => {
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
                },
                (error: unknown) => {
                    Logger.warn('Response compression failed', { error });
                    send(bytes);
                },
            );
            return res;
        };
        next();
    };

const resultsPageCompression = createResponseCompression();

export const compressResultsPage: RequestHandler = (req, res, next) => {
    if (!lightdashConfig.httpServer.responseCompressionEnabled) {
        next();
        return;
    }
    resultsPageCompression(req, res, next);
};
