import express from 'express';
import passport from 'passport';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    getGoogleLogin,
    getGoogleLoginFailure,
    getGoogleLoginSuccess,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { getFlash } from '../controllers/flash';
import { userModel } from '../models/models';
import { SavedQueriesModel } from '../models/savedQueries';
import { UserModel } from '../models/UserModel';
import { healthService, userService } from '../services/services';
import { sanitizeEmailParam, sanitizeStringParam } from '../utils';
import { dashboardRouter } from './dashboardRouter';
import { inviteLinksRouter } from './inviteLinksRouter';
import { organizationRouter } from './organizationRouter';
import { projectRouter } from './projectRouter';
import { userRouter } from './userRouter';

export const apiV1Router = express.Router();

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

apiV1Router.get('/flash', getFlash);

apiV1Router.post('/register', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await userService.registerInitialUser({
            firstName: sanitizeStringParam(req.body.firstName),
            lastName: sanitizeStringParam(req.body.lastName),
            organizationName: sanitizeStringParam(req.body.organizationName),
            email: sanitizeEmailParam(req.body.email),
            password: sanitizeStringParam(req.body.password),
            isMarketingOptedIn: !!req.body.isMarketingOptedIn,
            isTrackingAnonymized: !!req.body.isTrackingAnonymized,
            jobTitle: req.body.jobTitle,
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
    lightdashConfig.auth.google.loginPath,
    getGoogleLogin,
    passport.authenticate('google', {
        scope: ['profile', 'email'],
    }),
);

apiV1Router.get(
    lightdashConfig.auth.google.callbackPath,
    passport.authenticate('google', {
        failureRedirect: '/api/v1/oauth/google/failure',
        successRedirect: '/api/v1/oauth/google/success',
        failureFlash: true,
    }),
);
apiV1Router.get('/oauth/google/failure', getGoogleLoginFailure);
apiV1Router.get('/oauth/google/success', getGoogleLoginSuccess);

apiV1Router.get('/logout', (req, res, next) => {
    req.logout();
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
            });
        }
    });
});

apiV1Router.get(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    async (req, res, next) => {
        SavedQueriesModel.getById(req.params.savedQueryUuid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.delete(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.delete(
            req.user!.userUuid,
            req.user!.organizationUuid,
            req.params.savedQueryUuid,
        )
            .then(() => {
                res.json({
                    status: 'ok',
                    results: undefined,
                });
            })
            .catch(next);
    },
);

apiV1Router.patch(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.update(
            req.user!.userUuid,
            req.user!.organizationUuid,
            req.params.savedQueryUuid,
            req.body.savedQuery,
        )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.post(
    '/saved/:savedQueryUuid/version',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.addVersion(
            req.user!.userUuid,
            req.user!.organizationUuid,
            req.params.savedQueryUuid,
            req.body.savedQuery,
        )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.use('/invite-links', inviteLinksRouter);
apiV1Router.use('/org', organizationRouter);
apiV1Router.use('/user', userRouter);
apiV1Router.use('/projects/:projectUuid', projectRouter);
apiV1Router.use('/dashboards/:dashboardUuid', dashboardRouter);
