import express from 'express';
import passport from 'passport';
import { setFlagsFromString } from 'v8';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    redirectOIDCFailure,
    redirectOIDCSuccess,
    storeOIDCRedirect,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { userModel } from '../models/models';
import { UserModel } from '../models/UserModel';
import { healthService, userService } from '../services/services';
import { sanitizeEmailParam, sanitizeStringParam } from '../utils';
import { dashboardRouter } from './dashboardRouter';
import { inviteLinksRouter } from './inviteLinksRouter';
import { jobsRouter } from './jobsRouter';
import { organizationRouter } from './organizationRouter';
import { passwordResetLinksRouter } from './passwordResetLinksRouter';
import { projectRouter } from './projectRouter';
import { savedChartRouter } from './savedChartRouter';
import { shareRouter } from './shareRouter';
import { userRouter } from './userRouter';

const puppeteer = require('puppeteer');

export const apiV1Router = express.Router();

apiV1Router.get('/livez', async (req, res, next) => {
    res.json({
        status: 'ok',
    });
});

apiV1Router.get('/health', async (req, res, next) => {
    healthService
        .getHealthState(!!req.user?.userUuid)
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

apiV1Router.post('/register', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await userService.registerNewUserWithOrg({
            firstName: sanitizeStringParam(req.body.firstName),
            lastName: sanitizeStringParam(req.body.lastName),
            email: sanitizeEmailParam(req.body.email),
            password: sanitizeStringParam(req.body.password),
        });
        const sessionUser = await userModel.findSessionUserByUUID(
            lightdashUser.userUuid,
        );
        req.login(sessionUser, (err) => {
            if (err) {
                next(err);
            }
            res.json({
                status: 'ok',
                results: lightdashUser,
            });
        });
    } catch (e) {
        next(e);
    }
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
    passport.authenticate('okta', {
        scope: ['openid', 'profile', 'email'],
    }),
);

apiV1Router.get(
    lightdashConfig.auth.okta.callbackPath,
    passport.authenticate('okta', {
        failureRedirect: '/api/v1/oauth/failure',
        successRedirect: '/api/v1/oauth/success',
        failureFlash: true,
    }),
);

apiV1Router.get(
    lightdashConfig.auth.google.loginPath,
    storeOIDCRedirect,
    passport.authenticate('google', {
        scope: ['profile', 'email'],
    }),
);

apiV1Router.get(
    lightdashConfig.auth.google.callbackPath,
    passport.authenticate('google', {
        failureRedirect: '/api/v1/oauth/failure',
        successRedirect: '/api/v1/oauth/success',
        failureFlash: true,
    }),
);
apiV1Router.get('/oauth/failure', redirectOIDCFailure);
apiV1Router.get('/oauth/success', redirectOIDCSuccess);

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
apiV1Router.use('/dashboards/:dashboardUuid', dashboardRouter);
apiV1Router.use('/password-reset', passwordResetLinksRouter);
apiV1Router.use('/jobs', jobsRouter);
apiV1Router.use('/share', shareRouter);

// Extra endpoints for headless-chrome testing
if (process.env.CI === 'true') {
    apiV1Router.get(
        '/test-headless-browser-callback/:flag',
        async (req, res, next) => {
            // Returns json with the same argument specified in flag
            // Wait a random number of seconds between 0 an 1, to ensure the response can overlap with other requests.
            const delay = Math.floor(Math.random() * 1000);
            setTimeout(() => {
                console.debug(
                    `Got headless chrome callback request with flag ${req.params.flag} `,
                );
                res.json({
                    flag: req.params.flag,
                    delay,
                });
            }, delay);
        },
    );

    apiV1Router.get('/test-headless-browser/:flag', async (req, res, next) => {
        let browser;

        try {
            const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
            console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();
            const hostname =
                process.env.NODE_ENV === 'development'
                    ? 'lightdash-dev'
                    : 'lightdash';

            const testUrl = `http://${hostname}:${
                process.env.PORT || 3000
            }/api/v1/test-headless-browser-callback/${req.params.flag}`;
            console.debug(`Fetching headless chrome URL: ${testUrl}`);

            const response = await page.goto(testUrl, {});
            const result = await response.json();
            console.debug(`Fetching headless chrome response: `, result);

            res.json({
                response: result,
                request: {
                    flag: req.params.flag,
                    browser: browserWSEndpoint,
                    url: testUrl,
                },
            });
        } catch (e) {
            console.error(e);
            next(e.message);
        } finally {
            if (browser) await browser.close();
        }
    });
}
