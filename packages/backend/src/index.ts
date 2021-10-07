import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import morgan from 'morgan';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import expressSession from 'express-session';
import cookieParser from 'cookie-parser';
import { SessionUser } from 'common';
import connectSessionKnex from 'connect-session-knex';
import bodyParser from 'body-parser';
import * as OpenApiValidator from 'express-openapi-validator';
import apiSpec from 'common/dist/openapibundle.json';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { AuthorizationError, errorHandler } from './errors';
import { apiV1Router } from './api/apiV1';
import { UserModel } from './models/User';
import database from './database/database';
import { lightdashConfig } from './config/lightdashConfig';
import { analytics } from './analytics/client';
import { VERSION } from './version';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';

const KnexSessionStore = connectSessionKnex(expressSession);

const store = new KnexSessionStore({
    knex: database as any,
    createtable: false,
    tablename: 'sessions',
    sidfieldname: 'sid',
});
const app = express();
Sentry.init({
    release: VERSION,
    dsn: process.env.SENTRY_DSN,
    integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Tracing.Integrations.Express({
            app,
        }),
    ],
    tracesSampleRate: 1.0,
});
app.use(
    Sentry.Handlers.requestHandler({
        user: ['userUuid', 'organizationUuid', 'organizationName'],
    }),
);
app.use(Sentry.Handlers.tracingHandler());
app.use(express.json());

// Logging
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
    expressSession({
        secret: lightdashConfig.lightdashSecret,
        proxy: lightdashConfig.trustProxy,
        cookie: {
            maxAge: 86400000, // 1 day
            secure: lightdashConfig.secureCookies,
            httpOnly: true,
            sameSite: 'lax',
        },
        resave: false,
        saveUninitialized: false,
        store,
    }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(
    OpenApiValidator.middleware({
        // @ts-ignore
        apiSpec,
        validateRequests: {
            removeAdditional: 'all',
        },
        validateResponses: true,
        validateApiSpec: true,
        validateSecurity: false,
        operationHandlers: false,
        ignorePaths: (p: string) => !p.endsWith('invite-links'),
    }),
);
// api router
app.use('/api/v1', apiV1Router);

// frontend
app.use(express.static(path.join(__dirname, '../../frontend/build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
});

// errors
app.use(Sentry.Handlers.errorHandler());
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    const errorResponse = errorHandler(error);
    analytics.track({
        event: 'api.error',
        organizationId: req.user?.organizationUuid,
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
    console.log(
        `   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
    );
});

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        interface User extends SessionUser {}
    }
}

// passport config
passport.use(
    new LocalStrategy(
        { usernameField: 'email', passwordField: 'password' },
        async (email, password, done) => {
            try {
                const user = await UserModel.login(email, password);
                return done(null, user);
            } catch {
                return done(
                    new AuthorizationError(
                        'Email and password not recognized.',
                    ),
                );
            }
        },
    ),
);
passport.serializeUser((user, done) => {
    done(null, user.userUuid);
});

passport.deserializeUser(async (id: string, done) => {
    const user = await UserModel.findSessionUserByUUID(id);
    done(null, user);
});
