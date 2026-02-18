import { AuthorizationError } from '@lightdash/common';
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

const getDatabricksSessionOrQuery = (
    req: express.Request,
    key: 'projectUuid' | 'projectName' | 'serverHostName' | 'credentialsName',
) =>
    req.session.oauth?.databricks?.[key] ||
    (typeof req.query[key] === 'string' ? req.query[key] : undefined);

const resolveDynamicDatabricksOauthConfig = async (req: express.Request) => {
    const projectUuid = getDatabricksSessionOrQuery(req, 'projectUuid');
    let projectName = getDatabricksSessionOrQuery(req, 'projectName');
    let serverHostName = getDatabricksSessionOrQuery(req, 'serverHostName');
    const credentialsName = getDatabricksSessionOrQuery(req, 'credentialsName');
    let projectClientId: string | undefined;
    let projectClientSecret: string | undefined;

    if (projectUuid) {
        if (!req.account) {
            throw new AuthorizationError('User session not found');
        }
        const databricksConfig = await req.services
            .getProjectService()
            .getDatabricksOAuthConfigForProject(projectUuid, req.account);
        projectName = databricksConfig.projectName;
        serverHostName = databricksConfig.serverHostName;
        projectClientId = databricksConfig.oauthClientId;
        projectClientSecret = databricksConfig.oauthClientSecret;
    }

    if (!serverHostName) {
        return undefined;
    }

    const clientId =
        projectClientId || lightdashConfig.auth.databricks.clientId;
    if (!clientId) {
        throw new AuthorizationError(
            'Databricks OAuth client is not configured',
        );
    }

    const clientSecret = projectClientId
        ? projectClientSecret
        : lightdashConfig.auth.databricks.clientSecret;
    const oidc = getDatabricksOidcEndpointsFromHost(serverHostName);
    return {
        projectUuid,
        projectName: projectName?.trim() || undefined,
        serverHostName: oidc.host,
        credentialsName: credentialsName?.trim() || undefined,
        clientId,
        clientSecret,
        authorizationURL: oidc.authorizationURL,
        tokenURL: oidc.tokenURL,
        issuer: oidc.authorizationURL,
        strategyName: getDatabricksStrategyName({
            host: oidc.host,
            clientId,
        }),
    };
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
                strategyName = dynamicConfig.strategyName;
                passport.use(
                    strategyName,
                    createDatabricksStrategy(dynamicConfig),
                );
                req.session.oauth = req.session.oauth || {};
                req.session.oauth.databricks = {
                    projectUuid: dynamicConfig.projectUuid,
                    projectName: dynamicConfig.projectName,
                    serverHostName: dynamicConfig.serverHostName,
                    credentialsName: dynamicConfig.credentialsName,
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
