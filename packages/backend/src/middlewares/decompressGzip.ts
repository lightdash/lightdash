import { NextFunction, Request, Response } from 'express';
import Logger from '../logging/logger';
import type PrometheusMetrics from '../prometheus/PrometheusMetrics';

export const createGzipMetricsMiddleware =
    (prometheusMetrics?: PrometheusMetrics) =>
    (req: Request, _res: Response, next: NextFunction) => {
        if (req.headers['content-encoding'] === 'gzip') {
            const bodySize = Buffer.byteLength(JSON.stringify(req.body));
            prometheusMetrics?.gzipDecompressionCounter?.inc({
                result: 'success',
            });
            prometheusMetrics?.gzipDecompressionBytesHistogram?.observe(
                bodySize,
            );
            Logger.debug(
                `Decompressed gzip request: ${bodySize} bytes (${req.method} ${req.path})`,
            );
        }
        next();
    };
