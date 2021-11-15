import express from 'express';
import { ForbiddenError } from '../errors';
import {
    organizationService,
    projectService,
    userService,
} from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

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

organizationRouter.get('/projects', isAuthenticated, async (req, res, next) =>
    organizationService
        .getProjects(req.user!)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next),
);

organizationRouter.post('/projects', isAuthenticated, async (req, res, next) =>
    projectService
        .create(req.user!, req.body)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
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

organizationRouter.delete(
    '/user/:userUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        if (req.user!.userUuid === req.params.userUuid) {
            throw new ForbiddenError('User can not delete themself');
        }

        await userService
            .delete(req.user!, req.params.userUuid)
            .then(() => {
                res.json({
                    status: 'ok',
                    results: undefined,
                });
            })
            .catch(next);
    },
);
