// organize-imports-ignore
// eslint-disable-next-line import/order
import otelSdk from './otel'; // must be imported first

import { LightdashMode, SessionUser } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { SamplingContext } from '@sentry/types';
import bodyParser from 'body-parser';
import flash from 'connect-flash';
import connectSessionKnex from 'connect-session-knex';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import expressSession from 'express-session';
import expressStaticGzip from 'express-static-gzip';
import passport from 'passport';
import refresh from 'passport-oauth2-refresh';
import path from 'path';
import reDoc from 'redoc-express';
import apiSpec from './generated/swagger.json';
import { analytics } from './analytics/client';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import { SlackService } from './clients/Slack/Slackbot';
import { lightdashConfig } from './config/lightdashConfig';
import {
    apiKeyPassportStrategy,
    googlePassportStrategy,
    localPassportStrategy,
    oktaPassportStrategy,
    azureAdPassportStrategy,
    oneLoginPassportStrategy,
} from './controllers/authentication';
import database from './database/database';
import { errorHandler } from './errors';
import { RegisterRoutes } from './generated/routes';
import Logger from './logging/logger';
import { slackAuthenticationModel, userModel } from './models/models';
import { expressWinstonMiddleware } from './logging/winston';
import { apiV1Router } from './routers/apiV1Router';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { VERSION } from './version';
import { registerNodeMetrics } from './nodeMetrics';
import { wrapOtelSpan } from './utils';

// @ts-ignore
// eslint-disable-next-line no-extend-native, func-names
BigInt.prototype.toJSON = function () {
    return this.toString();
};

process
    .on('unhandledRejection', (reason, p) => {
        Logger.error('Unhandled Rejection at Promise', reason, p);
    })
    .on('uncaughtException', (err) => {
        Logger.error('Uncaught Exception thrown', err);
        process.exit(1);
    });

const KnexSessionStore = connectSessionKnex(expressSession);

const store = new KnexSessionStore({
    knex: database as any,
    createtable: false,
    tablename: 'sessions',
    sidfieldname: 'sid',
});
const app = express();

const tracesSampler = (context: SamplingContext): boolean | number => {
    if (
        context.request?.url?.endsWith('/status') ||
        context.request?.url?.endsWith('/health') ||
        context.request?.url?.endsWith('/favicon.ico') ||
        context.request?.url?.endsWith('/robots.txt') ||
        context.request?.url?.endsWith('livez') ||
        context.request?.headers?.['user-agent']?.includes('GoogleHC')
    ) {
        return 0.0;
    }
    return 0.2;
};

Sentry.init({
    release: VERSION,
    dsn: process.env.SENTRY_DSN,
    environment:
        process.env.NODE_ENV === 'development'
            ? 'development'
            : lightdashConfig.mode,
    integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Tracing.Integrations.Express({
            app,
        }),
    ],
    ignoreErrors: ['WarehouseQueryError', 'FieldReferenceError'],
    tracesSampler,
    beforeBreadcrumb(breadcrumb) {
        if (
            breadcrumb.category === 'http' &&
            breadcrumb?.data?.url &&
            breadcrumb.data.url.startsWith('https://hub.docker.com')
        ) {
            return null;
        }
        return breadcrumb;
    },
});
app.use(
    Sentry.Handlers.requestHandler({
        user: ['userUuid', 'organizationUuid', 'organizationName', 'email'],
    }) as express.RequestHandler,
);
app.use(Sentry.Handlers.tracingHandler());
app.use(express.json({ limit: lightdashConfig.maxPayloadSize }));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(
    expressSession({
        secret: lightdashConfig.lightdashSecret,
        proxy: lightdashConfig.trustProxy,
        rolling: true,
        cookie: {
            maxAge: (lightdashConfig.cookiesMaxAgeHours || 24) * 60 * 60 * 1000, // in ms
            secure: lightdashConfig.secureCookies,
            httpOnly: true,
            sameSite: 'lax',
        },
        resave: false,
        saveUninitialized: false,
        store,
    }),
);
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

app.use(expressWinstonMiddleware);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'), {
        headers: { 'Cache-Control': 'no-cache, private' },
    });
});

// api router
app.use('/api/v1', apiV1Router);
RegisterRoutes(app);

// Api docs
if (
    lightdashConfig.mode === LightdashMode.PR ||
    process.env.NODE_ENV !== 'production'
) {
    app.get('/api/docs/openapi.json', (req, res) => {
        res.send(apiSpec);
    });
    app.get(
        '/api/docs',
        reDoc({
            title: 'Lightdash API Docs',
            specUrl: '/api/docs/openapi.json',
        }),
    );
}

// frontend assets - immutable because vite appends hash to filenames
app.use(
    '/assets',
    expressStaticGzip(path.join(__dirname, '../../frontend/build/assets'), {
        index: false,
        customCompressions: [
            {
                encodingName: 'gzip',
                fileExtension: 'gzip',
            },
        ],
    }),
);

// frontend static files - no cache
app.use(
    express.static(path.join(__dirname, '../../frontend/build'), {
        setHeaders: () => ({
            // private - browsers can cache but not CDNs
            // no-cache - caches must revalidate with the origin server before using a cached copy
            'Cache-Control': 'no-cache, private',
        }),
    }),
);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'), {
        headers: { 'Cache-Control': 'no-cache, private' },
    });
});

// errors
app.use(Sentry.Handlers.errorHandler());
app.use((error: Error, req: Request, res: Response, _: NextFunction) => {
    const errorResponse = errorHandler(error);
    Logger.error(
        `Handled error of type ${errorResponse.name} on [${req.method}] ${req.path}`,
        errorResponse,
    );
    analytics.track({
        event: 'api.error',
        userId: req.user?.userUuid,
        anonymousId: !req.user?.userUuid
            ? LightdashAnalytics.anonymousId
            : undefined,
        properties: {
            name: errorResponse.name,
            statusCode: errorResponse.statusCode,
            route: req.path,
            method: req.method,
        },
    });
    res.status(errorResponse.statusCode).send({
        status: 'error',
        error: {
            statusCode: errorResponse.statusCode,
            name: errorResponse.name,
            message: errorResponse.message,
            data: errorResponse.data,
        },
    });
});

// Monitor Node.js process with opentelemetry
if (process.env.NODE_ENV !== 'development') {
    registerNodeMetrics();
}

// Run the server
const port = process.env.PORT || 8080;
app.listen(port, () => {
    if (process.env.HEADLESS !== 'true') {
        Logger.info(
            `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
        );
    }
});

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        interface User extends SessionUser {}
    }
}

passport.use(apiKeyPassportStrategy);
passport.use(localPassportStrategy);
if (googlePassportStrategy) {
    passport.use(googlePassportStrategy);
    refresh.use(googlePassportStrategy);
}
if (oktaPassportStrategy) {
    passport.use('okta', oktaPassportStrategy);
}
if (oneLoginPassportStrategy) {
    passport.use('oneLogin', oneLoginPassportStrategy);
}
if (azureAdPassportStrategy) {
    passport.use('azuread', azureAdPassportStrategy);
}
passport.serializeUser((user, done) => {
    // On login (user changes), user.userUuid is written to the session store in the `sess.passport.data` field
    done(null, user.userUuid);
});

// Before each request handler we read `sess.passport.user` from the session store
passport.deserializeUser(async (id: string, done) => {
    // Convert to a full user profile
    try {
        const user = await wrapOtelSpan('Passport.deserializeUser', {}, () =>
            userModel.findSessionUserByUUID(id),
        );
        // Store that user on the request (`req`) object
        done(null, user);
    } catch (e) {
        done(e);
    }
});

export const slackService = new SlackService({
    slackAuthenticationModel,
    lightdashConfig,
});

let worker: SchedulerWorker | undefined;
if (lightdashConfig.scheduler?.enabled) {
    worker = new SchedulerWorker({ lightdashConfig });
    worker.run().catch((e) => {
        Logger.error('Error starting scheduler worker', e);
    });
}

const onExit = () => {
    const asyncExit = async () => {
        if (worker && worker.runner) {
            try {
                await worker.runner.stop();
                Logger.info('Stopped scheduler worker');
            } catch (e) {
                Logger.error('Error stopping scheduler worker', e);
            }
        }
        if (otelSdk) {
            try {
                await otelSdk.shutdown();
                Logger.info('Stopped OpenTelemetry SDK');
            } catch (e) {
                Logger.error('Error stopping OpenTelemetry SDK', e);
            }
        }
    };
    asyncExit()
        .catch((e) => {
            Logger.error('Error stopping server', e);
        })
        .finally(() => {
            process.exit();
        });
};

process.on('SIGUSR2', onExit);
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);
process.on('SIGHUP', onExit);
process.on('SIGABRT', onExit);
