import {
    LightdashMode,
    LightdashRequestMethodHeader,
    LightdashSdkVersionHeader,
    LightdashVersionHeader,
    SessionUser,
} from '@lightdash/common';
import { getActiveSpan } from '@sentry/node';
import * as express from 'express';
import * as expressWinston from 'express-winston';
import ExecutionContext from 'node-execution-context';
import * as winston from 'winston';
import { lightdashConfig } from '../config/lightdashConfig';
import { AuditActor, AuditLogEvent, AuditResource } from './auditLog';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    audit: 4,
    debug: 5,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    audit: 'cyan',
    debug: 'white',
};
winston.addColors(colors);

export type SentryInfo = {
    sentryTraceId?: string;
};

const addSentryTraceId = winston.format(
    (info): winston.Logform.TransformableInfo & SentryInfo => {
        const gcpProjectId = lightdashConfig.googleCloudPlatform.projectId;
        const traceId = getActiveSpan()?.spanContext().traceId;
        return {
            ...info,
            sentryTraceId: traceId,
            ...(gcpProjectId &&
                traceId && {
                    'logging.googleapis.com/trace': `projects/${gcpProjectId}/traces/${traceId}`,
                }),
        };
    },
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
    const traceId = info.sentryTraceId ? `[${info.sentryTraceId}]` : '';
    const jobId = info.job?.id ? `[Job:${info.job.id}]` : '';
    const serviceName = info.serviceName ? `[${info.serviceName}]` : '';
    const clientVersion = info.sdkVersion || info.clientVersion;
    let client = '';
    if (info.requestMethod === 'SDK') {
        client = `[SDK${clientVersion ? `:${clientVersion}` : ''}]`;
    } else if (info.requestMethod === 'WEB_APP') {
        client = `[WEB${clientVersion ? `:${clientVersion}` : ''}]`;
    }
    return `${info.timestamp} [Lightdash]${traceId}${jobId}${serviceName}${client} ${info.level}: ${info.message}`;
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

const PAST_TENSE_ACTIONS: Record<string, string> = {
    view: 'viewed',
    create: 'created',
    update: 'updated',
    delete: 'deleted',
    manage: 'managed',
    run: 'ran',
    login: 'logged in',
    logout: 'logged out',
    promote: 'promoted',
};

export const formatAuditAction = (action: string): string =>
    PAST_TENSE_ACTIONS[action] ?? action;

export const formatAuditActor = (actor: AuditActor): string => {
    if (actor.type === 'anonymous') {
        return 'anonymous user';
    }
    if (actor.type === 'service-account') {
        if (actor.description) {
            return `service-account "${actor.description}"`;
        }
        return `service-account ${actor.uuid}`;
    }
    // session, pat, oauth
    if ('email' in actor && actor.email) {
        return actor.email;
    }
    if (
        'firstName' in actor &&
        actor.firstName &&
        'lastName' in actor &&
        actor.lastName
    ) {
        return `${actor.firstName} ${actor.lastName}`;
    }
    return actor.uuid;
};

export const formatAuditResource = (resource: AuditResource): string => {
    const typePart = resource.type;

    if (resource.metadata) {
        const parts = Object.entries(resource.metadata)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        return `${typePart} -> ${parts}`;
    }
    // Permission-type subjects (CustomSql, UnderlyingData, Explore, Project, etc.)
    // with no meaningful unique identifier — fall back to project/org context
    if (resource.projectUuid) {
        return `${typePart} in project ${resource.projectUuid}`;
    }
    if (resource.organizationUuid) {
        return `${typePart} in organization ${resource.organizationUuid}`;
    }
    return typePart;
};

export const formatAuditMessage = (event: AuditLogEvent): string => {
    const actor = formatAuditActor(event.actor);
    const action = formatAuditAction(event.action);
    const resource = formatAuditResource(event.resource);
    const status = `(${event.status})`;
    const reason = event.reason ? ` - ${event.reason}` : '';
    return `${actor} ${action} ${resource} ${status}${reason}`;
};

export const logAuditEvent = (event: AuditLogEvent): void => {
    winstonLogger.log({
        level: 'audit',
        message: formatAuditMessage(event),
        ...event,
    });
};

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
            impersonationAdmin: req.session?.impersonation?.adminUserUuid,
            impersonationTarget: req.session?.impersonation?.targetUserUuid,
            requestMethod: req.header(LightdashRequestMethodHeader),
            sdkVersion: req.header(LightdashSdkVersionHeader),
            clientVersion: req.header(LightdashVersionHeader),
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
            impersonationAdmin: req.session?.impersonation?.adminUserUuid,
            impersonationTarget: req.session?.impersonation?.targetUserUuid,
        });
    }
    next();
};
