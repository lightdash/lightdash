import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../controllers/authentication';

export const analyticsRouter = express.Router({ mergeParams: true });

analyticsRouter.get(
    '/user-activity/:projectUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { projectUuid } = req.params;
            if (!projectUuid) {
                res.json({
                    status: 'error',
                    results: 'Missing projectUuid',
                });
            }
            const userActivity = await req.services
                .getAnalyticsService()
                .getUserActivity(projectUuid, req.user!);
            res.json({
                status: 'ok',
                results: userActivity,
            });
        } catch (e) {
            next(e);
        }
    },
);
