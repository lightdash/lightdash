import express from 'express';
import { userService } from '../services/services';
import { unauthorisedInDemo } from './authentication';

export const passwordResetLinksRouter = express.Router();

passwordResetLinksRouter.get(
    '/:code',
    unauthorisedInDemo,
    async (req, res, next) =>
        userService
            .getPasswordResetLink(req.params.code)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);

passwordResetLinksRouter.post('/', unauthorisedInDemo, async (req, res, next) =>
    userService
        .recoverPassword(req.body)
        .then(() => {
            res.json({
                status: 'ok',
            });
        })
        .catch(next),
);

passwordResetLinksRouter.patch(
    '/',
    unauthorisedInDemo,
    async (req, res, next) =>
        userService
            .resetPassword(req.body)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);
