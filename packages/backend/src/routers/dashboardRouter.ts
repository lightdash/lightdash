import { isDashboardChartTileType } from '@lightdash/common';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import {
    analyticsService,
    dashboardService,
    projectService,
} from '../services/services';

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
    '/availableFilters',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const dashboard = await dashboardService.getById(
                req.user!,
                req.params.dashboardUuid,
            );

            const chartTiles = dashboard.tiles.filter(isDashboardChartTileType);
            const savedQueryUuids = chartTiles
                .map((tile) => tile.properties.savedChartUuid)
                .filter((uuid): uuid is string => !!uuid);

            res.json({
                status: 'ok',
                results:
                    await projectService.getAvailableFiltersForSavedQueries(
                        req.user!,
                        savedQueryUuids,
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

dashboardRouter.get(
    '/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await dashboardService.getSchedulers(
                    req.user!,
                    req.params.dashboardUuid,
                ),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.post(
    '/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await dashboardService.createScheduler(
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
