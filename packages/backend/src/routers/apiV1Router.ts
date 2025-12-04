import express, { type Router } from 'express';
import passport from 'passport';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    getLoginHint,
    getOidcRedirectURL,
    initiateOktaOpenIdLogin,
    storeOIDCRedirect,
    storeSlackContext,
} from '../controllers/authentication';
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
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
                results: UserModel.lightdashUserFromSession(req.user!),
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
