import { getObjectValue } from '@lightdash/common';
import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const savedChartRouter: Router = express.Router();

savedChartRouter.get(
    '/:savedQueryUuidOrSlug',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .get(
                getObjectValue(req.params, 'savedQueryUuidOrSlug'),
                req.account!,
            )
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
            .getViewStats(
                req.user!,
                getObjectValue(req.params, 'savedQueryUuid'),
            )
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
                req.account!,
                getObjectValue(req.params, 'savedQueryUuid'),
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
            .delete(req.user!, getObjectValue(req.params, 'savedQueryUuid'))
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
            .update(
                req.user!,
                getObjectValue(req.params, 'savedQueryUuid'),
                req.body,
            )
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
            .togglePinning(
                req.user!,
                getObjectValue(req.params, 'savedQueryUuid'),
            )
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
            .createVersion(
                req.user!,
                getObjectValue(req.params, 'savedQueryUuid'),
                req.body,
            )
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
                    .getSchedulers(
                        req.user!,
                        getObjectValue(req.params, 'savedQueryUuid'),
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
                results: await req.services
                    .getSavedChartService()
                    .createScheduler(
                        req.user!,
                        getObjectValue(req.params, 'savedQueryUuid'),
                        req.body,
                    ),
            });
        } catch (e) {
            next(e);
        }
    },
);
