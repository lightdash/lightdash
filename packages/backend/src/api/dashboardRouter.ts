import express from 'express';
import { dashboardService } from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

export const dashboardRouter = express.Router({ mergeParams: true });

dashboardRouter.get('/', isAuthenticated, async (req, res, next) => {
    try {
        res.json({
            status: 'ok',
            results: await dashboardService.getById(
                req.user!,
                req.params.dashboardUuid,
            ),
        });
    } catch (e) {
        next(e);
    }
});

dashboardRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await dashboardService.update(
                    req.user!,
                    req.params.dashboardUuid,
                    req.body,
                ),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.delete(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            await dashboardService.delete(req.user!, req.params.dashboardUuid);
            res.json({
                status: 'ok',
                results: undefined,
            });
        } catch (e) {
            next(e);
        }
    },
);
