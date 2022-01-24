import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { userModel } from '../models/models';
import { UserModel } from '../models/UserModel';
import { userService } from '../services/services';
import { sanitizeEmailParam, sanitizeStringParam } from '../utils';

export const userRouter = express.Router();

userRouter.get('/', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: UserModel.lightdashUserFromSession(req.user!),
    });
});

userRouter.post('/', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await userService.create(req.body.inviteCode, {
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

userRouter.patch(
    '/me',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        userService
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

userRouter.post(
    '/password',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        userService
            .updatePassword(req.user!.userId, req.user!.userUuid, req.body)
            .then(() => {
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
            })
            .catch(next),
);

userRouter.post('/password/reset', unauthorisedInDemo, async (req, res, next) =>
    userService
        .resetPassword(req.body)
        .then(() => {
            res.json({
                status: 'ok',
            });
        })
        .catch(next),
);

userRouter.get('/identities', isAuthenticated, async (req, res, next) => {
    const identities = await userService.getLinkedIdentities(req.user!);
    res.json({
        status: 'ok',
        results: identities,
    });
});

userRouter.patch(
    '/me/complete',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        userService
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
