import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const dashboardRouter: Router = express.Router({ mergeParams: true });

dashboardRouter.get(
    '/:dashboardUuidOrSlug',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await req.services
                    .getDashboardService()
                    .getByIdOrSlug(req.user!, req.params.dashboardUuidOrSlug),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.get(
    '/:dashboardUuid/views',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getAnalyticsService()
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
    '/:dashboardUuidOrSlug',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await req.services
                    .getDashboardService()
                    .update(
                        req.user!,
                        req.params.dashboardUuidOrSlug,
                        req.body,
                    ),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.patch(
    '/:dashboardUuid/pinning',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await req.services
                    .getDashboardService()
                    .togglePinning(req.user!, req.params.dashboardUuid),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.delete(
    '/:dashboardUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            await req.services
                .getDashboardService()
                .delete(req.user!, req.params.dashboardUuid);
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
    '/:dashboardUuid/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await req.services
                    .getDashboardService()
                    .getSchedulers(req.user!, req.params.dashboardUuid),
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.post(
    '/:dashboardUuid/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await req.services
                    .getDashboardService()
                    .createScheduler(
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

dashboardRouter.post(
    '/availableFilters',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await req.services
                .getProjectService()
                .getAvailableFiltersForSavedQueries(req.account!, req.body);

            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

dashboardRouter.post(
    '/:dashboardUuid/export',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await req.services
                .getUnfurlService()
                .exportDashboard(
                    req.params.dashboardUuid,
                    req.body.queryFilters,
                    req.body.gridWidth,
                    req.user!,
                    req.body.selectedTabs,
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

dashboardRouter.post(
    '/:dashboardUuid/exportCsv',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await req.services
                .getCsvService()
                .scheduleExportCsvDashboard(
                    req.user!,
                    req.params.dashboardUuid,
                    req.body.filters,
                    req.body.dateZoomGranularity,
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
