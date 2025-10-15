import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../controllers/authentication';

export const jobsRouter: Router = express.Router({ mergeParams: true });

jobsRouter.get('/', isAuthenticated, async (req, res, next) => {
    next('Not implemented');
});

jobsRouter.get(
    '/:jobUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { jobUuid } = req.params;
            const job = await req.services
                .getProjectService()
                .getJobStatus(jobUuid, req.user!);
            res.json({
                status: 'ok',
                results: job,
            });
        } catch (e) {
            next(e);
        }
    },
);
