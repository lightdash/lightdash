import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const savedChartRouter = express.Router();

savedChartRouter.get(
    '/:savedQueryUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
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
        req.services
            .getSavedChartService()
            .getViewStats(req.user!, req.params.savedQueryUuid)
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
        req.services
            .getProjectService()
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
        req.services
            .getSavedChartService()
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
        req.services
            .getSavedChartService()
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
        req.services
            .getSavedChartService()
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
        req.services
            .getSavedChartService()
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
                results: await req.services
                    .getSavedChartService()
                    .getSchedulers(req.user!, req.params.savedQueryUuid),
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
                results: await req.services
                    .getSavedChartService()
                    .createScheduler(
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
