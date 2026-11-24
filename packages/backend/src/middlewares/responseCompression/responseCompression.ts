import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';
import zlib from 'zlib';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;
const GZIP_LEVEL = 1;
const BROTLI_QUALITY = 1;

const jsonContentTypePattern = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

export const shouldCompressResponse = (
    _req: Request,
    res: Response,
): boolean => {
    const contentType = res.getHeader('Content-Type');
    if (
        typeof contentType !== 'string' ||
        !jsonContentTypePattern.test(contentType)
    ) {
        return false;
    }
    return res.getHeader('Content-Disposition') === undefined;
};

export const responseCompression = (): RequestHandler =>
    compression({
        filter: shouldCompressResponse,
        threshold: RESPONSE_COMPRESSION_THRESHOLD_BYTES,
        level: GZIP_LEVEL,
        brotli: {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
            },
        },
    });
