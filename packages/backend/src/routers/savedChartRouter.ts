import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { SavedQueriesModel } from '../models/savedQueries';
import { projectService } from '../services/services';

export const savedChartRouter = express.Router();

savedChartRouter.get(
    '/:savedQueryUuid',
    isAuthenticated,
    async (req, res, next) => {
        SavedQueriesModel.getById(req.params.savedQueryUuid)
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
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.delete(req.user!, req.params.savedQueryUuid)
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
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.update(
            req.user!,
            req.params.savedQueryUuid,
            req.body.savedQuery,
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
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.addVersion(
            req.user!,
            req.params.savedQueryUuid,
            req.body.savedQuery,
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
