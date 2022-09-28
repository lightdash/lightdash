import express from 'express';
import { isAuthenticated } from '../../controllers/authentication';
import { projectService } from '../../services/services';

export const dbtCloudIntegrationRouter = express.Router({ mergeParams: true });

dbtCloudIntegrationRouter.get(
    '/settings',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const integration = await projectService.findDbtCloudIntegration(
                req.user!,
                req.params.projectUuid,
            );
            res.json({
                status: 'ok',
                results: integration,
            });
        } catch (e) {
            next(e);
        }
    },
);

dbtCloudIntegrationRouter.get(
    '/metrics',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await projectService.getdbtCloudMetrics(
                req.user!,
                req.params.projectUuid,
            );
            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);
