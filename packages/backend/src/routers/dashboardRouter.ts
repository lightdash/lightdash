import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { analyticsService, dashboardService } from '../services/services';

export const dashboardRouter = express.Router({ mergeParams: true });

dashboardRouter.get(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

dashboardRouter.get(
    '/views',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        analyticsService
            .getDashboardViews(req.params.dashboardUuid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);
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

dashboardRouter.patch(
    '/pinning',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await dashboardService.togglePinning(
                    req.user!,
                    req.params.dashboardUuid,
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
