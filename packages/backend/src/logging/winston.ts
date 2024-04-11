import { SessionUser } from '@lightdash/common';
import * as express from 'express';
import * as expressWinston from 'express-winston';
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

const formatters = {
    plain: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.uncolorize(),
        winston.format.printf(
            (info) =>
                `${info.timestamp} [Lightdash] ${info.level}: ${info.message}`,
        ),
    ),
    pretty: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(
            (info) =>
                `${info.timestamp} [Lightdash] ${info.level}: ${
                    info.serviceName ? `[${info.serviceName}] ` : ''
                }${info.message}`,
        ),
    ),
    json: winston.format.combine(
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
