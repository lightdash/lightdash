import { LightdashMode, SessionUser } from '@lightdash/common';
import apiSpec from '@lightdash/common/dist/openapibundle.json';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { SamplingContext } from '@sentry/types';
import bodyParser from 'body-parser';
import flash from 'connect-flash';
import connectSessionKnex from 'connect-session-knex';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import expressSession from 'express-session';
import passport from 'passport';
import path from 'path';
import reDoc from 'redoc-express';
import { analytics } from './analytics/client';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import { SlackService } from './clients/Slack/Slackbot';
import { lightdashConfig } from './config/lightdashConfig';
import {
    apiKeyPassportStrategy,
    googlePassportStrategy,
    localPassportStrategy,
    oktaPassportStrategy,
} from './controllers/authentication';
import database from './database/database';
import { errorHandler } from './errors';
import { RegisterRoutes } from './generated/routes';
import Logger from './logger';
import { slackAuthenticationModel, userModel } from './models/models';
import morganMiddleware from './morganMiddleware';
import { apiV1Router } from './routers/apiV1Router';
import { unfurlService } from './services/services';
import { VERSION } from './version';

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
        context.request?.url?.endsWith('livez')
    ) {
        return 0.0;
    }
    return 1.0;
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
        user: ['userUuid', 'organizationUuid', 'organizationName'],
    }) as express.RequestHandler,
);
app.use(Sentry.Handlers.tracingHandler());
app.use(express.json({ limit: lightdashConfig.maxPayloadSize }));

// Logging
app.use(morganMiddleware);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
if (process.env.NODE_ENV === 'development') {
    app.use(
        OpenApiValidator.middleware({
            apiSpec: path.join(
                __dirname,
                '../../common/src/openapibundle.json',
            ),
            // apiSpec,
            validateRequests: true,
            ignoreUndocumented: true,
            validateResponses: {
                removeAdditional: 'failing',
                onError: (error, body, req) => {
                    Logger.warn(
                        `[${req.method}] ${
                            req.originalUrl
                        } Response body fails validation:\n${
                            error.message
                        }\n${JSON.stringify(body, null, 4)}`,
                    );
                },
            },
            validateSecurity: false,
            validateApiSpec: true,
            operationHandlers: false,
        }),
    );
}
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

// frontend
app.use(express.static(path.join(__dirname, '../../frontend/build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
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
}
if (oktaPassportStrategy) {
    passport.use('okta', oktaPassportStrategy);
}
passport.serializeUser((user, done) => {
    // On login (user changes), user.userUuid is written to the session store in the `sess.passport.data` field
    done(null, user.userUuid);
});

// Before each request handler we read `sess.passport.user` from the session store
passport.deserializeUser(async (id: string, done) => {
    // Convert to a full user profile
    const user = await userModel.findSessionUserByUUID(id);
    // Store that user on the request (`req`) object
    done(null, user);
});

export const slackService = new SlackService({
    slackAuthenticationModel,
    lightdashConfig,
});
