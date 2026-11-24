import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';
import zlib from 'zlib';
import { lightdashConfig } from '../../config/lightdashConfig';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;
const GZIP_LEVEL = 1;
const BROTLI_QUALITY = 1;

const jsonContentTypePattern = /^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i;

const isJsonResponse = (_req: Request, res: Response): boolean => {
    const contentType = res.getHeader('Content-Type');
    return (
        typeof contentType === 'string' &&
        jsonContentTypePattern.test(contentType)
    );
};

export const createResponseCompression = (): RequestHandler => {
    const compress = compression({
        filter: isJsonResponse,
        threshold: RESPONSE_COMPRESSION_THRESHOLD_BYTES,
        level: GZIP_LEVEL,
        brotli: {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
            },
        },
    });
    return (req, res, next) => {
        res.vary('Accept-Encoding');
        compress(req, res, next);
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
