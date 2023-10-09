import express from 'express';
import { unauthorisedInDemo } from '../controllers/authentication';
import { userService } from '../services/services';

export const passwordResetLinksRouter = express.Router();

passwordResetLinksRouter.get(
    '/:code',
    unauthorisedInDemo,
    async (req, res, next) =>
        userService
            .verifyPasswordResetLink(req.params.code)
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
