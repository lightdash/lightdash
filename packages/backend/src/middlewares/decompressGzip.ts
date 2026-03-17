import { NextFunction, Request, Response } from 'express';
import Logger from '../logging/logger';
import type PrometheusMetrics from '../prometheus/PrometheusMetrics';

export const createGzipMetricsMiddleware =
    (prometheusMetrics?: PrometheusMetrics) =>
    (req: Request, _res: Response, next: NextFunction) => {
        if (req.headers['content-encoding'] === 'gzip') {
            try {
                const bodySize = Buffer.byteLength(JSON.stringify(req.body));
                prometheusMetrics?.gzipDecompressionCounter?.inc();
                prometheusMetrics?.gzipDecompressionBytesHistogram?.observe(
                    bodySize,
                );
                Logger.debug(
                    `Decompressed gzip request: ${bodySize} bytes (${req.method} ${req.path})`,
                );
            } catch (err) {
                Logger.warn(
                    `Failed to measure decompressed gzip body size (${req.method} ${req.path}): ${err}`,
                );
            }
        }
        next();
    };

export const createGzipErrorMiddleware =
    (prometheusMetrics?: PrometheusMetrics) =>
    (err: Error, req: Request, _res: Response, next: NextFunction) => {
        if (req.headers['content-encoding'] === 'gzip') {
            prometheusMetrics?.gzipDecompressionFailureCounter?.inc();
            Logger.warn(
                `Gzip decompression failed (${req.method} ${req.path}): ${err.message}`,
            );
        }
        next(err);
    };
