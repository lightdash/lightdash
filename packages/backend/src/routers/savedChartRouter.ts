import {
    ForbiddenError,
    getObjectValue,
    type SessionUser,
} from '@lightdash/common';
import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const savedChartRouter: Router = express.Router();

const getSessionUser = (req: express.Request): SessionUser => {
    if (!req.user) {
        throw new ForbiddenError('User is required');
    }
    return req.user;
};

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

savedChartRouter.get(
    '/:savedQueryUuid/views',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .getViewStats(
                getSessionUser(req),
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
            .delete(
                getSessionUser(req),
                getObjectValue(req.params, 'savedQueryUuid'),
            )
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
                getSessionUser(req),
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
                getSessionUser(req),
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
                getSessionUser(req),
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
