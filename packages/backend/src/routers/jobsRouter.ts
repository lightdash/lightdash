import express from 'express';
import { isAuthenticated } from '../controllers/authentication';
import { projectService } from '../services/services';

export const jobsRouter = express.Router({ mergeParams: true });

jobsRouter.get('/', isAuthenticated, async (req, res, next) => {
    next('Not implemented');
});

jobsRouter.get('/:jobUuid', isAuthenticated, async (req, res, next) => {
    try {
        const { jobUuid } = req.params;
        const job = await projectService.getJobStatus(jobUuid, req.user!);
        res.json({
            status: 'ok',
            results: job,
        });
    } catch (e: any) {
        next(e);
    }
});
