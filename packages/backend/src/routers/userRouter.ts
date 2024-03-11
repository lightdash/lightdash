import {
    getRequestMethod,
    LightdashRequestMethodHeader,
} from '@lightdash/common';
import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const userRouter = express.Router();

userRouter.patch(
    '/me',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getUserService()
            .updateUser(req.user!, req.body)
            .then((user) => {
                res.json({
                    status: 'ok',
                    results: user,
                });
            })
            .catch(next);
    },
);

userRouter.get('/password', isAuthenticated, async (req, res, next) =>
    req.services
        .getUserService()
        .hasPassword(req.user!)
        .then((hasPassword: boolean) => {
            res.json({
                status: 'ok',
                results: hasPassword,
            });
        })
        .catch(next),
);

userRouter.post(
    '/password',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        req.services
            .getUserService()
            .updatePassword(req.user!, req.body)
            .then(() => {
                req.logout((err) => {
                    if (err) {
                        return next(err);
                    }
                    return req.session.save((err2) => {
                        if (err2) {
                            next(err2);
                        } else {
                            res.json({
                                status: 'ok',
                            });
                        }
                    });
                });
            })
            .catch(next),
);

userRouter.post('/password/reset', unauthorisedInDemo, async (req, res, next) =>
    req.services
        .getUserService()
        .resetPassword(req.body)
        .then(() => {
            res.json({
                status: 'ok',
            });
        })
        .catch(next),
);

userRouter.get('/identities', isAuthenticated, async (req, res, next) => {
    const identities = await req.services
        .getUserService()
        .getLinkedIdentities(req.user!);
    res.json({
        status: 'ok',
        results: identities,
    });
});

userRouter.delete(
    '/identity',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getUserService()
            .deleteLinkedIdentity(req.user!, req.body)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next);
    },
);

userRouter.patch(
    '/me/complete',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getUserService()
            .completeUserSetup(req.user!, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

userRouter.post(
    '/me/personal-access-tokens',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getPersonalAccessTokenService()
            .createPersonalAccessToken(
                req.user!,
                req.body,
                getRequestMethod(req.header(LightdashRequestMethodHeader)),
            )
            .then((results) => res.json({ status: 'ok', results }))
            .catch(next);
    },
);

userRouter.get(
    '/me/personal-access-tokens',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getPersonalAccessTokenService()
            .getAllPersonalAccessTokens(req.user!)
            .then((results) =>
                res.json({
                    status: 'ok',
                    results,
                }),
            )
            .catch(next);
    },
);

userRouter.delete(
    '/me/personal-access-tokens/:tokenUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getPersonalAccessTokenService()
            .deletePersonalAccessToken(req.user!, req.params.tokenUuid)
            .then(() =>
                res.json({
                    status: 'ok',
                }),
            )
            .catch(next);
    },
);
