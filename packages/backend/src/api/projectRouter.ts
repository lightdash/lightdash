import express from 'express';
import {
    ApiCompiledQueryResults,
    ApiExploreResults,
    ApiExploresResults,
    ApiQueryResults,
    ApiStatusResults,
    isExploreError,
    MetricQuery,
} from 'common';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { projectService } from '../services/services';

export const projectRouter = express.Router();

projectRouter.get('/:projectUuid', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: await projectService.getProject(
            req.params.projectUuid,
            req.user!,
        ),
    });
});

projectRouter.patch(
    '/:projectUuid/warehouse',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .updateWarehouseConnection(
                req.params.projectUuid,
                req.user!,
                req.body.warehouseConnection,
            )
            .then((data) => {
                res.json({
                    status: 'ok',
                    results: data,
                });
            })
            .catch(next);
    },
);

projectRouter.get(
    '/:projectUuid/explores',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const explores = await projectService.getAllExplores(
                req.user!,
                req.params.projectUuid,
            );
            const results: ApiExploresResults = explores.map((explore) =>
                isExploreError(explore)
                    ? { name: explore.name, errors: explore.errors }
                    : { name: explore.name },
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

projectRouter.get(
    '/:projectUuid/explores/:exploreId',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results: ApiExploreResults = await projectService.getExplore(
                req.user!,
                req.params.projectUuid,
                req.params.exploreId,
            );
            res.json({ status: 'ok', results });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.post(
    '/:projectUuid/explores/:exploreId/compileQuery',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { body } = req;
            const metricQuery: MetricQuery = {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
                tableCalculations: body.tableCalculations,
            };
            const results: ApiCompiledQueryResults =
                await projectService.compileQuery(
                    req.user!,
                    metricQuery,
                    req.params.projectUuid,
                    req.params.exploreId,
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

projectRouter.post(
    '/:projectUuid/explores/:exploreId/runQuery',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { body } = req;
            const metricQuery: MetricQuery = {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
                tableCalculations: body.tableCalculations,
            };
            const results: ApiQueryResults = await projectService.runQuery(
                req.user!,
                metricQuery,
                req.params.projectUuid,
                req.params.exploreId,
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

projectRouter.post(
    '/:projectUuid/refresh',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            // Runs async - error will appear on status endpoint
            projectService
                .refreshAllTables(req.user!, req.params.projectUuid)
                .catch((e) => console.log(`Error running refresh: ${e}`));
            res.json({ status: 'ok' });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get('/:projectUuid/status', async (req, res, next) => {
    try {
        const results: ApiStatusResults = await projectService.getProjectStatus(
            req.params.projectUuid,
            req.user!,
        );
        res.json({
            status: 'ok',
            results,
        });
    } catch (e) {
        next(e);
    }
});

projectRouter.post('');
