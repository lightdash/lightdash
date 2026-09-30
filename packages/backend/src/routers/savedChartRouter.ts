import { getObjectValue } from '@lightdash/common';
import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const savedChartRouter: Router = express.Router();

savedChartRouter.get<{ savedQueryUuidOrSlug: string }>(
    '/:savedQueryUuidOrSlug',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .get(
                getObjectValue(req.params, 'savedQueryUuidOrSlug'),
                req.account!,
                {
                    projectUuid:
                        typeof req.query.projectUuid === 'string'
                            ? req.query.projectUuid
                            : undefined,
                },
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

savedChartRouter.get<{ savedQueryUuid: string }>(
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

savedChartRouter.get<{ savedQueryUuid: string }>(
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

savedChartRouter.delete<{ savedQueryUuid: string }>(
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

savedChartRouter.patch<{ savedQueryUuid: string }>(
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

savedChartRouter.patch<{ savedQueryUuid: string }>(
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

savedChartRouter.post<{ savedQueryUuid: string }>(
    '/:savedQueryUuid/version',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .createVersion(
                req.account!,
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
