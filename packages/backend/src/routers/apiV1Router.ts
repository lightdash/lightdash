import { AuthorizationError, NotFoundError } from '@lightdash/common';
import { randomUUID } from 'crypto';
import express, { type Router } from 'express';
import fs from 'fs/promises';
import passport from 'passport';
import path from 'path';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    getLoginHint,
    getOidcRedirectURL,
    initiateOktaOpenIdLogin,
    storeOIDCRedirect,
    storeSlackContext,
} from '../controllers/authentication';
import { databricksPassportStrategy } from '../controllers/authentication/strategies/databricksStrategy';
import { UserModel } from '../models/UserModel';
import { createContentDispositionHeader } from '../utils/FileDownloadUtils/FileDownloadUtils';
import { dashboardRouter } from './dashboardRouter';
import { headlessBrowserRouter } from './headlessBrowser';
import { inviteLinksRouter } from './inviteLinksRouter';
import { jobsRouter } from './jobsRouter';
import mcpRouter from './mcpRouter';
import oauthRouter from './oauthRouter';
import { organizationRouter } from './organizationRouter';
import { passwordResetLinksRouter } from './passwordResetLinksRouter';
import { projectRouter } from './projectRouter';
import { savedChartRouter } from './savedChartRouter';
import { userRouter } from './userRouter';

export const apiV1Router: Router = express.Router();

apiV1Router.get('/livez', async (req, res, next) => {
    res.json({
        status: 'ok',
    });
});

apiV1Router.get('/health', async (req, res, next) => {
    req.services
        .getHealthService()
        .getHealthState(req.user)
        .then((state) =>
            res.json({
                status: 'ok',
                results: state,
            }),
        )
        .catch(next);
});

apiV1Router.get('/results/:fileName', async (req, res, next) => {
    try {
        const resultsPath = lightdashConfig.results.local?.path;
        if (!resultsPath) {
            throw new NotFoundError('Local results storage is not enabled');
        }

        const { fileName } = req.params;
        if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
            throw new NotFoundError(`File not found: ${fileName}`);
        }

        const extension = path.extname(fileName).toLowerCase();
        if (!['.jsonl', '.csv', '.xlsx'].includes(extension)) {
            throw new NotFoundError(`File not found: ${fileName}`);
        }

        const resolvedBasePath = path.resolve(resultsPath);
        const resolvedFilePath = path.resolve(resolvedBasePath, fileName);
        if (!resolvedFilePath.startsWith(`${resolvedBasePath}${path.sep}`)) {
            throw new NotFoundError(`File not found: ${fileName}`);
        }

        try {
            await fs.access(resolvedFilePath);
        } catch {
            throw new NotFoundError(`File not found: ${fileName}`);
        }

        const contentTypeByExtension: Record<string, string> = {
            '.jsonl': 'application/x-ndjson',
            '.csv': 'text/csv',
            '.xlsx':
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        const contentType =
            contentTypeByExtension[extension] || 'application/octet-stream';

        const downloadName =
            typeof req.query.downloadName === 'string'
                ? req.query.downloadName
                : fileName;

        res.set('Content-Type', contentType);
        res.set(
            'Content-Disposition',
            createContentDispositionHeader(downloadName),
        );
        res.sendFile(resolvedFilePath);
    } catch (error) {
        next(error);
    }
});

apiV1Router.get('/flash', (req, res) => {
    res.json({
        status: 'ok',
        results: req.flash(),
    });
});

apiV1Router.post('/debug/explore-perf', async (req, res, next) => {
    try {
        const logPath =
            process.env.EXPLORE_PERF_LOG_PATH ||
            '/tmp/lightdash-explore-perf.log';
        const logDir = path.dirname(logPath);
        await fs.mkdir(logDir, { recursive: true });
        const correlationId = req.get('x-explore-perf-id') ?? randomUUID();
        const entry = {
            ts: new Date().toISOString(),
            correlationId,
            userUuid: req.user?.userUuid,
            ...req.body,
        };
        await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
        res.json({
            status: 'ok',
            results: { logged: true, correlationId },
        });
    } catch (error) {
        next(error);
    }
});

apiV1Router.post('/login', passport.authenticate('local'), (req, res, next) => {
    if (!req.user) {
        next(new AuthorizationError('User session not found'));
        return;
    }
    const { user } = req;
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
                results: UserModel.lightdashUserFromSession(user),
            });
        }
    });
});

apiV1Router.get(
    lightdashConfig.auth.okta.loginPath,
    storeOIDCRedirect,
    initiateOktaOpenIdLogin,
);

apiV1Router.get(lightdashConfig.auth.okta.callbackPath, (req, res, next) =>
    passport.authenticate('okta', {
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
        failureFlash: true,
    })(req, res, next),
);

apiV1Router.get(
    lightdashConfig.auth.azuread.loginPath,
    storeOIDCRedirect,
    passport.authenticate('azuread', {
        scope: ['openid', 'profile', 'email'].join(' '),
    }),
);

apiV1Router.get(lightdashConfig.auth.azuread.callbackPath, (req, res, next) =>
    passport.authenticate('azuread', {
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
        failureFlash: true,
    })(req, res, next),
);

apiV1Router.get(
    lightdashConfig.auth.oidc.loginPath,
    storeOIDCRedirect,
    passport.authenticate(
        'oidc',
        lightdashConfig.auth.oidc.scopes
            ? {
                  scope: lightdashConfig.auth.oidc.scopes,
              }
            : {},
    ),
);

apiV1Router.get(lightdashConfig.auth.oidc.callbackPath, (req, res, next) =>
    passport.authenticate('oidc', {
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
        failureFlash: true,
    })(req, res, next),
);

apiV1Router.get(
    lightdashConfig.auth.oneLogin.loginPath,
    storeOIDCRedirect,
    passport.authenticate('oneLogin', {
        scope: ['openid', 'profile', 'email'],
    }),
);

apiV1Router.get(lightdashConfig.auth.oneLogin.callbackPath, (req, res, next) =>
    passport.authenticate('oneLogin', {
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
        failureFlash: true,
    })(req, res, next),
);

apiV1Router.get(
    lightdashConfig.auth.google.loginPath,
    storeOIDCRedirect,
    (req, res, next) => {
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            loginHint: getLoginHint(req),
        })(req, res, next);
    },
);
apiV1Router.get(
    '/login/gdrive',
    storeOIDCRedirect,
    passport.authenticate('google', {
        scope: [
            'profile',
            'email',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
        ],
        accessType: 'offline',
        prompt: 'consent',
        session: false,
        includeGrantedScopes: true,
    }),
);

apiV1Router.get(
    '/login/bigquery',
    storeOIDCRedirect,
    passport.authenticate('google', {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/bigquery'],
        accessType: 'offline',
        prompt: 'consent',
        session: false,
        includeGrantedScopes: true,
    }),
);

// path to start the OAuth flow
apiV1Router.get(
    '/auth/slack',
    (req, res, next) => {
        // If the user is not already authenticated in Lightdash, force them to login on lightdash first
        if (req.user?.userUuid) {
            return next();
        }
        return res.redirect('/login?redirect=/api/v1/auth/slack');
    },
    storeSlackContext,
    passport.authenticate('slack'),
);

// OAuth callback url
apiV1Router.get(
    '/auth/slack/callback',
    passport.authenticate('slack', {
        failureRedirect: '/login',
        session: false,
    }),
    (req, res) => {
        const slackContext = req.session.slack;
        const params = new URLSearchParams();

        if (slackContext?.teamId) params.set('team', slackContext.teamId);
        if (slackContext?.channelId)
            params.set('channel', slackContext.channelId);
        if (slackContext?.messageTs)
            params.set('message', slackContext.messageTs);
        if (slackContext?.threadTs)
            params.set('thread_ts', slackContext.threadTs);

        const redirectUrl = `/auth/slack/success${
            params.toString() ? `?${params.toString()}` : ''
        }`;
        res.redirect(redirectUrl);
    },
);

apiV1Router.get(lightdashConfig.auth.google.callbackPath, (req, res, next) => {
    passport.authenticate('google', {
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
        failureFlash: true,
        includeGrantedScopes: true,
    })(req, res, next);
});

apiV1Router.get(
    lightdashConfig.auth.snowflake.loginPath,
    storeOIDCRedirect,
    passport.authenticate('snowflake'),
);

apiV1Router.get(
    lightdashConfig.auth.snowflake.callbackPath,
    (req, res, next) => {
        passport.authenticate('snowflake', {
            failureRedirect: getOidcRedirectURL(false)(req),
            successRedirect: getOidcRedirectURL(true)(req),
        })(req, res, next);
    },
);

// Databricks OAuth routes - only register if strategy is configured
// (requires DATABRICKS_OAUTH_CLIENT_ID, DATABRICKS_OAUTH_AUTHORIZATION_ENDPOINT, DATABRICKS_OAUTH_TOKEN_ENDPOINT)
if (databricksPassportStrategy) {
    apiV1Router.get(
        lightdashConfig.auth.databricks.loginPath,
        storeOIDCRedirect,
        passport.authenticate('databricks'),
    );

    apiV1Router.get(
        lightdashConfig.auth.databricks.callbackPath,
        (req, res, next) => {
            passport.authenticate('databricks', {
                failureRedirect: getOidcRedirectURL(false)(req),
                successRedirect: getOidcRedirectURL(true)(req),
            })(req, res, next);
        },
    );
} else {
    apiV1Router.get(
        lightdashConfig.auth.databricks.loginPath,
        (req, res, next) => {
            res.status(404).json({
                status: 'error',
                message: 'Databricks OAuth is not configured',
            });
        },
    );
}

apiV1Router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        return req.session.destroy((err2) => {
            if (err2) {
                next(err2);
            } else {
                res.json({
                    status: 'ok',
                });
            }
        });
    });
});

apiV1Router.use('/saved', savedChartRouter);
apiV1Router.use('/invite-links', inviteLinksRouter);
apiV1Router.use('/org', organizationRouter);
apiV1Router.use('/user', userRouter);
apiV1Router.use('/projects/:projectUuid', projectRouter);
apiV1Router.use('/dashboards', dashboardRouter);
apiV1Router.use('/password-reset', passwordResetLinksRouter);
apiV1Router.use('/jobs', jobsRouter);
apiV1Router.use('/headless-browser', headlessBrowserRouter);
apiV1Router.use('/mcp', mcpRouter);
apiV1Router.use('/oauth', oauthRouter);
