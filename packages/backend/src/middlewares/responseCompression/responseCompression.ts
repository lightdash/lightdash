import type { Request, RequestHandler, Response } from 'express';
import zlib from 'zlib';
import { lightdashConfig } from '../../config/lightdashConfig';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;

type ResponseEncoding = 'br' | 'gzip';

const encoders: Record<ResponseEncoding, (body: Buffer) => Buffer> = {
    br: (body) =>
        zlib.brotliCompressSync(body, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
            },
        }),
    gzip: (body) => zlib.gzipSync(body, { level: 1 }),
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
            const encoded = encoders[encoding](bytes);
            const generateETag = req.app.get('etag fn') as
                | ((body: Buffer) => string)
                | undefined;
            if (generateETag && res.getHeader('ETag') === undefined) {
                res.setHeader('ETag', generateETag(encoded));
            }
            if (!req.fresh) {
                res.setHeader('Content-Encoding', encoding);
            }
            return send(encoded);
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
