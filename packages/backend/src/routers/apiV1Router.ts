import { AuthorizationError } from '@lightdash/common';
import {
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
    isDatabricksCliOAuthClientId,
} from '@lightdash/warehouses';
import express, { type Router } from 'express';
import passport from 'passport';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    getLoginHint,
    getOidcRedirectURL,
    initiateOktaOpenIdLogin,
    isAuthenticated,
    storeOIDCRedirect,
    storeSlackContext,
} from '../controllers/authentication';
import {
    createDatabricksStrategy,
    databricksPassportStrategy,
    getDatabricksOidcEndpointsFromHost,
    getDatabricksStrategyName,
} from '../controllers/authentication/strategies/databricksStrategy';
import { AiAgentService } from '../ee/services/AiAgentService/AiAgentService';
import Logger from '../logging/logger';
import { UserModel } from '../models/UserModel';
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

const resolveDynamicDatabricksOauthConfig = async (req: express.Request) => {
    const projectUuid =
        req.session.oauth?.databricks?.projectUuid ||
        (typeof req.query.projectUuid === 'string'
            ? req.query.projectUuid
            : undefined);

    let serverHostName =
        typeof req.query.serverHostName === 'string'
            ? req.query.serverHostName
            : undefined;

    // On the OAuth callback, Databricks sends an `iss` param with the OIDC
    // issuer URL (e.g. https://dbc-xxx.cloud.databricks.com/oidc).
    // Extract the host from it as a fallback when serverHostName isn't present.
    if (!serverHostName && typeof req.query.iss === 'string') {
        try {
            serverHostName = new URL(req.query.iss).host;
        } catch {
            // ignore invalid iss
        }
    }
    let projectClientId: string | undefined;
    let projectClientSecret: string | undefined;

    if (projectUuid) {
        if (!req.account) {
            throw new AuthorizationError('User session not found');
        }
        const databricksConfig = await req.services
            .getProjectService()
            .getDatabricksOAuthConfigForProject(projectUuid, req.account);
        serverHostName = databricksConfig.serverHostName;
        projectClientId = databricksConfig.oauthClientId;
        projectClientSecret = databricksConfig.oauthClientSecret;
    }

    if (!serverHostName) {
        return undefined;
    }

    // Resolve which OAuth client to use. CLI-default client IDs
    // (databricks-cli, dbt-databricks) only work with CLI redirect URIs,
    // so for browser flows prefer the server-configured client.
    let clientId: string;
    let clientSecret: string | undefined;
    if (projectClientId && !isDatabricksCliOAuthClientId(projectClientId)) {
        clientId = projectClientId;
        clientSecret = projectClientSecret;
    } else if (lightdashConfig.auth.databricks.clientId) {
        clientId = lightdashConfig.auth.databricks.clientId;
        clientSecret = lightdashConfig.auth.databricks.clientSecret;
    } else {
        throw new AuthorizationError(
            'Databricks OAuth client is not configured',
        );
    }
    const oidc = getDatabricksOidcEndpointsFromHost(serverHostName);
    return {
        projectUuid,
        clientId,
        clientSecret,
        authorizationURL: oidc.authorizationURL,
        tokenURL: oidc.tokenURL,
        issuer: oidc.issuer,
        strategyName: getDatabricksStrategyName({
            host: oidc.host,
            clientId,
            clientSecret,
        }),
    };
};

// Cache dynamic Databricks strategies to avoid leaking memory by
// registering a new passport strategy on every request.  The cache is
// bounded: entries are evicted after 10 minutes of inactivity so that
// stale config (e.g. rotated client secrets) is eventually picked up.
const DATABRICKS_STRATEGY_TTL_MS = 10 * 60 * 1000;
const databricksStrategyCache = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> }
>();

const getOrCreateDatabricksStrategy = (
    config: NonNullable<
        Awaited<ReturnType<typeof resolveDynamicDatabricksOauthConfig>>
    >,
): string => {
    const { strategyName } = config;
    const existing = databricksStrategyCache.get(strategyName);
    if (existing) {
        // Refresh TTL on access
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => {
            databricksStrategyCache.delete(strategyName);
            passport.unuse(strategyName);
        }, DATABRICKS_STRATEGY_TTL_MS);
        return strategyName;
    }

    passport.use(strategyName, createDatabricksStrategy(config));
    const timer = setTimeout(() => {
        databricksStrategyCache.delete(strategyName);
        passport.unuse(strategyName);
    }, DATABRICKS_STRATEGY_TTL_MS);
    databricksStrategyCache.set(strategyName, { timer });
    return strategyName;
};

const authenticateDatabricks = (
    getAuthenticateOptions?: (
        req: express.Request,
    ) => passport.AuthenticateOptions,
) =>
    async function databricksAuthHandler(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) {
        try {
            const options = getAuthenticateOptions?.(req);
            const dynamicConfig =
                await resolveDynamicDatabricksOauthConfig(req);

            let strategyName: string;
            if (dynamicConfig) {
                strategyName = getOrCreateDatabricksStrategy(dynamicConfig);
                req.session.oauth = req.session.oauth || {};
                req.session.oauth.databricks = {
                    projectUuid: dynamicConfig.projectUuid,
                };
            } else {
                req.session.oauth = req.session.oauth || {};
                req.session.oauth.databricks = undefined;
                if (!databricksPassportStrategy) {
                    res.status(404).json({
                        status: 'error',
                        message: 'Databricks OAuth is not configured',
                    });
                    return;
                }
                strategyName = 'databricks';
            }

            if (options) {
                passport.authenticate(strategyName, options)(req, res, next);
            } else {
                passport.authenticate(strategyName)(req, res, next);
            }
        } catch (error) {
            next(error);
        }
    };

apiV1Router.get('/livez', async (req, res, next) => {
    res.json({
        status: 'ok',
    });
});

apiV1Router.get('/debug/heap-snapshot', async (req, res) => {
    if (process.env.ENABLE_DEBUG_HEAP_SNAPSHOT !== 'true') {
        res.status(404).json({ status: 'error', message: 'Not found' });
        return;
    }

    try {
        const v8 = await import('v8');
        const path = await import('path');
        const fs = await import('fs');

        // Force GC before snapshot if available
        if (global.gc) {
            global.gc();
        }

        const snapshotPath = v8.writeHeapSnapshot();
        if (!snapshotPath) {
            res.status(500).json({
                status: 'error',
                message: 'Failed to write heap snapshot',
            });
            return;
        }

        const stats = fs.statSync(snapshotPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1);
        const mem = process.memoryUsage();

        res.json({
            status: 'ok',
            results: {
                snapshotPath,
                fileSizeMB: `${fileSizeMB}MB`,
                memory: {
                    rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
                    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
                    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
                    external: `${(mem.external / 1024 / 1024).toFixed(1)}MB`,
                    arrayBuffers: `${(mem.arrayBuffers / 1024 / 1024).toFixed(1)}MB`,
                },
            },
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
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

apiV1Router.get('/flash', (req, res) => {
    res.json({
        status: 'ok',
        results: req.flash(),
    });
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
        // Preserve query params (team, channel, message, thread_ts) in redirect
        const redirectPath = req.originalUrl;
        return res.redirect(
            `/login?redirect=${encodeURIComponent(redirectPath)}`,
        );
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

        // Process pending Slack message after OAuth (fire and forget)
        // NOTE: This runs in the web process (not scheduler) because it needs
        // access to an in-memory cache for updating the ephemeral OAuth message.
        // The actual AI processing IS scheduled via Graphile worker inside
        // processPendingSlackMessage. To move this entirely to the scheduler,
        // the response_url cache would need to move to the database.
        if (
            req.user?.userUuid &&
            slackContext?.teamId &&
            slackContext?.channelId &&
            slackContext?.messageTs
        ) {
            const aiAgentService =
                req.services.getAiAgentService<AiAgentService>();
            aiAgentService
                .processPendingSlackMessage({
                    teamId: slackContext.teamId,
                    channelId: slackContext.channelId,
                    messageTs: slackContext.messageTs,
                    threadTs: slackContext.threadTs,
                    userUuid: req.user.userUuid,
                })
                .catch((err: unknown) => {
                    // Log but don't fail the redirect
                    Logger.error(
                        'Failed to process pending Slack message:',
                        err,
                    );
                });
        }

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

apiV1Router.get(
    lightdashConfig.auth.databricks.loginPath,
    isAuthenticated,
    storeOIDCRedirect,
    authenticateDatabricks(),
);

apiV1Router.get(
    lightdashConfig.auth.databricks.callbackPath,
    isAuthenticated,
    authenticateDatabricks((req) => ({
        failureRedirect: getOidcRedirectURL(false)(req),
        successRedirect: getOidcRedirectURL(true)(req),
    })),
);

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
