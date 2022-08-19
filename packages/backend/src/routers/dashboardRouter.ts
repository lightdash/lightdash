import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { dashboardService } from '../services/services';

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
        } catch (e: any) {
            next(e);
        }
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
        } catch (e: any) {
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
        } catch (e: any) {
            next(e);
        }
    },
);
