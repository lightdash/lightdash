import { LightdashMode, SessionUser } from '@lightdash/common';
import { getActiveSpan } from '@sentry/node';
import * as express from 'express';
import * as expressWinston from 'express-winston';
import ExecutionContext from 'node-execution-context';
import winston from 'winston';
import { lightdashConfig } from '../config/lightdashConfig';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};
winston.addColors(colors);

export type SentryInfo = {
    sentryTraceId?: string;
};

const addSentryTraceId = winston.format(
    (info): winston.Logform.TransformableInfo & SentryInfo => ({
        ...info,
        sentryTraceId: getActiveSpan()?.spanContext().traceId,
    }),
);

export type ExecutionContextInfo = {
    worker?: {
        id: string | null;
    };
    job?: {
        id: string;
        queue_name: string | null;
        task_identifier: string;
        priority: number;
        attempts: number;
    };
};

const addExecutionContent = winston.format(
    (info): winston.Logform.TransformableInfo & ExecutionContextInfo =>
        ExecutionContext.exists()
            ? {
                  ...info,
                  ...ExecutionContext.get<ExecutionContextInfo>(),
              }
            : info,
);

const printMessage = (
    info: winston.Logform.TransformableInfo & ExecutionContextInfo & SentryInfo,
): string => {
    const jobId = info.job?.id ? `[Job:${info.job.id}]` : '';
    const serviceName = info.serviceName ? `[${info.serviceName}]` : '';
    return `${info.timestamp} [Lightdash]${jobId}${serviceName} ${info.level}: ${info.message}`;
};

const formatters = {
    plain: winston.format.combine(
        addSentryTraceId(),
        addExecutionContent(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.uncolorize(),
        winston.format.printf(printMessage),
    ),
    pretty: winston.format.combine(
        addSentryTraceId(),
        addExecutionContent(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(printMessage),
    ),
    json: winston.format.combine(
        addSentryTraceId(),
        addExecutionContent(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
    ),
};

const transports = [];
if (lightdashConfig.logging.outputs.includes('console')) {
    transports.push(
        new winston.transports.Console({
            format: formatters[
                lightdashConfig.logging.consoleFormat ||
                    lightdashConfig.logging.format
            ],
            level:
                lightdashConfig.logging.consoleLevel ||
                lightdashConfig.logging.level,
        }),
    );
}
if (lightdashConfig.logging.outputs.includes('file')) {
    transports.push(
        new winston.transports.File({
            filename: lightdashConfig.logging.filePath,
            format: formatters[
                lightdashConfig.logging.fileFormat ||
                    lightdashConfig.logging.format
            ],
            level:
                lightdashConfig.logging.fileLevel ||
                lightdashConfig.logging.level,
        }),
    );
}

export const winstonLogger = winston.createLogger({
    levels,
    transports,
});

declare global {
    namespace Express {
        interface User extends SessionUser {}
    }
}

export const expressWinstonMiddleware: express.RequestHandler =
    expressWinston.logger({
        winstonInstance: winstonLogger,
        level: 'http',
        msg: '{{req.method}} {{req.url}} {{res.statusCode}} - {{res.responseTime}} ms',
        colorize: false,
        meta: true,
        metaField: null, // on root of log
        dynamicMeta: (req, res) => ({
            userUuid: req.user?.userUuid,
            organizationUuid: req.user?.organizationUuid,
            includesResponse: true,
        }),
        requestWhitelist: ['url', 'headers', 'method'],
        responseWhitelist: ['statusCode'],
        headerBlacklist: [
            'cookie',
            'authorization',
            'connection',
            'accept-encoding',
        ],
    });

// Logs the request before the response is sent
export const expressWinstonPreResponseMiddleware: express.RequestHandler = (
    req,
    _res,
    next,
) => {
    if (lightdashConfig.mode !== LightdashMode.DEV) {
        winstonLogger.log({
            level: 'http',
            message: `${req.method} ${req.url}`,
            req: {
                method: req.method,
                url: req.url,
                headers: req.headers,
            },
            includesResponse: false,
            userUuid: req.user?.userUuid,
            organizationUuid: req.user?.organizationUuid,
        });
    }
    next();
};
