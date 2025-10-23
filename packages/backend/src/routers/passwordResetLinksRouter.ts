import express, { type Router } from 'express';
import { unauthorisedInDemo } from '../controllers/authentication';

export const passwordResetLinksRouter: Router = express.Router();

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
