import express from 'express';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { projectService } from '../services/services';

export const projectRouter = express.Router();

projectRouter.get('/:projectUuid', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: await projectService.getProject(
            req.params.projectUuid,
            req.user!,
        ),
    });
});

projectRouter.patch(
    '/:projectUuid/warehouse',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .updateWarehouseConnection(
                req.params.projectUuid,
                req.user!,
                req.body.warehouseConnection,
            )
            .then((data) => {
                res.json({
                    status: 'ok',
                    results: data,
                });
            })
            .catch(next);
    },
);
