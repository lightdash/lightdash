import {
    getRequestMethod,
    LightdashAppUuidHeader,
    LightdashBuildHashHeader,
    LightdashCliVersionHeader,
    LightdashMode,
    LightdashRequestMethodHeader,
    LightdashSdkVersionHeader,
    LightdashSignedDownloadHeader,
    LightdashVersionHeader,
    RequestMethod,
    SessionUser,
} from '@lightdash/common';
import { getActiveSpan } from '@sentry/node';
import { randomUUID } from 'crypto';
import * as express from 'express';
import * as expressWinston from 'express-winston';
import ExecutionContext from 'node-execution-context';
import qs from 'qs';
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
    organization_uuid?: string;
    organization_name?: string;
    app_uuid?: string;
    app_version?: number;
    // The client that made the request (Lightdash-Request-Method header).
    // Analytics stamps it on every event tracked while handling the request.
    request_method?: RequestMethod;
    query_request?: {
        startedAtMs: number;
        requestId: string;
        traceId: string | null;
    };
    scheduler?: {
        scheduler_uuid?: string;
        scheduler_name?: string;
        saved_sql_uuid?: string;
        job_id?: string;
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

export const getSchedulerContext = ():
    | NonNullable<ExecutionContextInfo['scheduler']>
    | undefined => {
    if (!ExecutionContext.exists()) return undefined;
    return ExecutionContext.get<ExecutionContextInfo>().scheduler;
};

// Reads the originating data app from the request-scoped ExecutionContext
// (populated by requestExecutionContextMiddleware from the app attribution
// header) so warehouse queries can be tagged back to the app. Returns an empty
// object outside an app-originated request.
export const getAppContext = (): Pick<ExecutionContextInfo, 'app_uuid'> => {
    if (!ExecutionContext.exists()) return {};
    return { app_uuid: ExecutionContext.get<ExecutionContextInfo>().app_uuid };
};

// Server-generated request timing survives asynchronous query submission via history.
export const getQueryRequestContext = (): ExecutionContextInfo =>
    ExecutionContext.exists()
        ? ExecutionContext.get<ExecutionContextInfo>()
        : {};

/** Attribution only: called after existing signed app-version access checks. */
export const setQueryAppVersion = (appUuid: string, version: number): void => {
    if (ExecutionContext.exists()) {
        ExecutionContext.update({ app_uuid: appUuid, app_version: version });
    }
};

const ALIAS_RESPONSE_TIME_AS_DURATION = winston.format((info) => {
    if (typeof info.responseTime === 'number' && info.duration_ms === undefined)
        return { ...info, duration_ms: info.responseTime };
    return info;
});

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
        ALIAS_RESPONSE_TIME_AS_DURATION(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.uncolorize(),
        winston.format.printf(printMessage),
    ),
    pretty: winston.format.combine(
        addSentryTraceId(),
        addExecutionContent(),
        ALIAS_RESPONSE_TIME_AS_DURATION(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(printMessage),
    ),
    json: winston.format.combine(
        addSentryTraceId(),
        addExecutionContent(),
        ALIAS_RESPONSE_TIME_AS_DURATION(),
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
            handleExceptions: true,
            handleRejections: true,
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
    exitOnError: false,
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

const formatAuditMetadataValue = (value: unknown): string => {
    if (typeof value !== 'object' || value === null) return String(value);

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

export const formatAuditResource = (resource: AuditResource): string => {
    const typePart = resource.type;

    if (resource.metadata) {
        const parts = Object.entries(resource.metadata)
            .map(([key, value]) => `${key}: ${formatAuditMetadataValue(value)}`)
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
    if (!winstonLogger.isLevelEnabled('audit')) return;

    winstonLogger.log({
        level: 'audit',
        message: formatAuditMessage(event),
        ...event,
        // Opt-in for deployments whose log indexers map `actor` as text
        ...(lightdashConfig.logging.auditActorAsString
            ? { actor: JSON.stringify(event.actor) }
            : {}),
    });
};

declare global {
    namespace Express {
        interface User extends SessionUser {}
    }
}

export const sanitizeRequestUrl = (url: string): string => {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return url;
    const fragmentStart = url.indexOf('#');
    if (fragmentStart !== -1 && fragmentStart < queryStart) return url;
    const queryEnd = fragmentStart === -1 ? url.length : fragmentStart;
    const query = url.slice(queryStart + 1, queryEnd);
    const sanitized = query.split('&').map((pair) => {
        const separator = pair.indexOf('=');
        if (separator === -1) return pair;
        const rawName = pair.slice(0, separator);
        let names: string[];
        try {
            names = Object.keys(
                qs.parse(`${rawName}=x`, { arrayLimit: 1000 }),
            ).map((name) => name.toLowerCase());
        } catch {
            return `${rawName}=[REDACTED]`;
        }
        if (
            names.some((name) =>
                [
                    'downloadtoken',
                    'code',
                    'state',
                    'access_token',
                    'refresh_token',
                ].includes(name),
            )
        ) {
            return `${rawName}=[REDACTED]`;
        }
        return pair;
    });
    return `${url.slice(0, queryStart + 1)}${sanitized.join('&')}${url.slice(queryEnd)}`;
};

const safeRequestHeaderNames = new Set([
    'content-length',
    'content-type',
    'host',
    'user-agent',
    'x-amzn-trace-id',
    'x-request-id',
    LightdashAppUuidHeader.toLowerCase(),
    LightdashBuildHashHeader.toLowerCase(),
    LightdashCliVersionHeader.toLowerCase(),
    LightdashRequestMethodHeader.toLowerCase(),
    LightdashSdkVersionHeader.toLowerCase(),
    LightdashSignedDownloadHeader.toLowerCase(),
    LightdashVersionHeader.toLowerCase(),
]);

const filterRequestHeaders = (
    headers: express.Request['headers'],
): express.Request['headers'] =>
    Object.fromEntries(
        Object.entries(headers).filter(([name]) =>
            safeRequestHeaderNames.has(name.toLowerCase()),
        ),
    );

export const expressWinstonMiddleware: express.RequestHandler =
    expressWinston.logger({
        winstonInstance: winstonLogger,
        level: 'http',
        msg: (req, res) =>
            `${req.method} ${sanitizeRequestUrl(req.url)} ${res.statusCode} - ${(res as typeof res & { responseTime?: number }).responseTime} ms`,
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
        requestFilter: (req, propertyName) => {
            if (propertyName === 'url') return sanitizeRequestUrl(req.url);
            if (propertyName === 'headers') {
                return filterRequestHeaders(req.headers);
            }
            return (req as unknown as Record<string, unknown>)[propertyName];
        },
        responseWhitelist: ['statusCode'],
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
            message: `${req.method} ${sanitizeRequestUrl(req.url)}`,
            req: {
                method: req.method,
                url: sanitizeRequestUrl(req.url),
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

// Stamps every log emitted while processing this request with the requesting
// user's organization context and, for data-app traffic, the originating app —
// by attaching them to the AsyncLocalStorage-backed ExecutionContext that
// `addExecutionContent` already merges into log payloads. The app id rides in
// on a self-reported header and is also read here so warehouse query tagging
// can attribute queries back to the app without threading it through service
// args. Place this AFTER session/auth middlewares so req.user and req.account
// are populated. req.user is set for session-authenticated requests; embed/JWT
// requests populate req.account only, so we fall back to it.
export const requestExecutionContextMiddleware: express.RequestHandler = (
    req,
    _res,
    next,
) => {
    const organizationUuid =
        req.user?.organizationUuid ??
        req.account?.organization?.organizationUuid;
    const organizationName =
        req.user?.organizationName ?? req.account?.organization?.name;
    const appUuidHeader = req.headers[LightdashAppUuidHeader.toLowerCase()];
    const appUuid =
        typeof appUuidHeader === 'string' ? appUuidHeader : undefined;
    const requestMethodHeader =
        req.headers[LightdashRequestMethodHeader.toLowerCase()];
    if (!organizationUuid && !organizationName && !appUuid) {
        next();
        return;
    }
    const context: ExecutionContextInfo = {
        query_request: {
            startedAtMs: Date.now(),
            requestId: randomUUID(),
            traceId: getActiveSpan()?.spanContext().traceId ?? null,
        },
        organization_uuid: organizationUuid,
        organization_name: organizationName,
        ...(appUuid ? { app_uuid: appUuid } : {}),
        request_method: getRequestMethod(
            typeof requestMethodHeader === 'string'
                ? requestMethodHeader
                : undefined,
        ),
    };
    if (ExecutionContext.exists()) {
        ExecutionContext.update(context as unknown as Record<string, unknown>);
        next();
        return;
    }
    ExecutionContext.run(() => next(), context);
};
