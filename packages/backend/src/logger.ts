import { LoggingWinston } from '@google-cloud/logging-winston';
import winston from 'winston';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const level = () => {
    if (process.env.LIGHTDASH_LOG_LEVEL) {
        return process.env.LIGHTDASH_LOG_LEVEL.toLowerCase();
    }
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

const terminalFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) =>
            `${info.timestamp} [Lightdash] ${info.level}: ${info.message}`,
    ),
);

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
);

const transports = [
    new winston.transports.Console({
        format: terminalFormat,
    }),
    new winston.transports.File({
        filename: 'logs/error.json.log',
        level: 'error',
        format: jsonFormat,
    }),
    new winston.transports.File({
        filename: 'logs/all.json.log',
        format: jsonFormat,
    }),
    new winston.transports.File({
        filename: 'logs/all.log',
        format: terminalFormat,
    }),
    new LoggingWinston(),
];

const Logger = winston.createLogger({
    level: level(),
    levels,
    transports,
});

export default Logger;
