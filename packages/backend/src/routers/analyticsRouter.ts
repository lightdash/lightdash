import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../controllers/authentication';
import { analyticsService, projectService } from '../services/services';

export const analyticsRouter = express.Router({ mergeParams: true });

analyticsRouter.get(
    '/user-activity/:projectUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { projectUuid } = req.params;
            const userActivity = await analyticsService.getUserActivity(
                projectUuid,
                req.user!,
            );
            res.json({
                status: 'ok',
                results: userActivity,
            });
        } catch (e) {
            next(e);
        }
    },
);
