import express from 'express';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { organizationService } from '../services/services';

export const organizationRouter = express.Router();

organizationRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        organizationService
            .updateOrg(req.user!, req.body)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);

organizationRouter.get('/users', isAuthenticated, async (req, res, next) =>
    organizationService
        .getUsers(req.user!)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next),
);
