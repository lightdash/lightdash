import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import {
    analyticsService,
    projectService,
    savedChartsService,
} from '../services/services';

export const savedChartRouter = express.Router();

savedChartRouter.get(
    '/:savedQueryUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        savedChartsService
            .get(req.params.savedQueryUuid, req.user!)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

savedChartRouter.get(
    '/:savedQueryUuid/views',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        analyticsService
            .getChartViews(req.params.savedQueryUuid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

savedChartRouter.get(
    '/:savedQueryUuid/availableFilters',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) =>
        projectService
            .getAvailableFiltersForSavedQuery(
                req.user!,
                req.params.savedQueryUuid,
            )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next),
);

savedChartRouter.delete(
    '/:savedQueryUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        savedChartsService
            .delete(req.user!, req.params.savedQueryUuid)
            .then(() => {
                res.json({
                    status: 'ok',
                    results: undefined,
                });
            })
            .catch(next);
    },
);

savedChartRouter.patch(
    '/:savedQueryUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        savedChartsService
            .update(req.user!, req.params.savedQueryUuid, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

savedChartRouter.patch(
    '/:savedQueryUuid/pinning',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        savedChartsService
            .togglePinning(req.user!, req.params.savedQueryUuid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

savedChartRouter.post(
    '/:savedQueryUuid/version',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        savedChartsService
            .createVersion(req.user!, req.params.savedQueryUuid, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

savedChartRouter.get(
    '/:savedQueryUuid/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await savedChartsService.getSchedulers(
                    req.user!,
                    req.params.savedQueryUuid,
                ),
            });
        } catch (e) {
            next(e);
        }
    },
);

savedChartRouter.post(
    '/:savedQueryUuid/schedulers',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            res.json({
                status: 'ok',
                results: await savedChartsService.createScheduler(
                    req.user!,
                    req.params.savedQueryUuid,
                    req.body,
                ),
            });
        } catch (e) {
            next(e);
        }
    },
);
