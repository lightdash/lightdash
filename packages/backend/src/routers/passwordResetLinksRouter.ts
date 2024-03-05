import express from 'express';
import { unauthorisedInDemo } from '../controllers/authentication';

export const passwordResetLinksRouter = express.Router();

passwordResetLinksRouter.get(
    '/:code',
    unauthorisedInDemo,
    async (req, res, next) =>
        req.services
            .getUserService()
            .verifyPasswordResetLink(req.params.code)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);

passwordResetLinksRouter.post('/', unauthorisedInDemo, async (req, res, next) =>
    req.services
        .getUserService()
        .recoverPassword(req.body)
        .then(() => {
            res.json({
                status: 'ok',
            });
        })
        .catch(next),
);
