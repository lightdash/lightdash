import express from 'express';
import { UserModel } from '../models/User';
import { userService } from '../services/services';
import { sanitizeEmailParam, sanitizeStringParam } from '../utils';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

export const userRouter = express.Router();

userRouter.get('/', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: UserModel.lightdashUserFromSession(req.user!),
    });
});

userRouter.post('/', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await userService.create({
            inviteCode: req.body.inviteCode,
            firstName: sanitizeStringParam(req.body.firstName),
            lastName: sanitizeStringParam(req.body.lastName),
            email: sanitizeEmailParam(req.body.email),
            password: sanitizeStringParam(req.body.password),
            isMarketingOptedIn: !!req.body.isMarketingOptedIn,
            isTrackingAnonymized: !!req.body.isTrackingAnonymized,
            jobTitle: req.body.jobTitle,
        });
        const sessionUser = await UserModel.findSessionUserByUUID(
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
        UserModel.updateProfile(req.user!.userId, req.user!.email, req.body)
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
        UserModel.updatePassword(req.user!.userId, req.user!.userUuid, req.body)
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
