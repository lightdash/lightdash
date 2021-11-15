import express from 'express';
import {
    ApiCompiledQueryResults,
    ApiExploreResults,
    ApiExploresResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    ApiStatusResults,
    MetricQuery,
    ProjectCatalog,
    TablesConfiguration,
} from 'common';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { dashboardService, projectService } from '../services/services';
import { SavedQueriesModel } from '../models/savedQueries';

export const projectRouter = express.Router({ mergeParams: true });

projectRouter.get('/', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: await projectService.getProject(
            req.params.projectUuid,
            req.user!,
        ),
    });
});

projectRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .update(req.params.projectUuid, req.user!, req.body)
            .then((data) => {
                res.json({
                    status: 'ok',
                    results: data,
                });
            })
            .catch(next);
    },
);

projectRouter.get('/explores', isAuthenticated, async (req, res, next) => {
    try {
        const results: ApiExploresResults =
            await projectService.getAllExploresSummary(
                req.user!,
                req.params.projectUuid,
                req.query.filtered === 'true',
            );
        res.json({
            status: 'ok',
            results,
        });
    } catch (e) {
        next(e);
    }
});

projectRouter.get(
    '/explores/:exploreId',
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
    '/explores/:exploreId/compileQuery',
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
            const results: ApiCompiledQueryResults = (
                await projectService.compileQuery(
                    req.user!,
                    metricQuery,
                    req.params.projectUuid,
                    req.params.exploreId,
                )
            ).query;
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
    '/explores/:exploreId/runQuery',
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
    '/refresh',
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

projectRouter.get('/status', isAuthenticated, async (req, res, next) => {
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

projectRouter.post(
    '/saved',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.create(
            req.user!.userUuid,
            req.params.projectUuid,
            req.user!.organizationUuid,
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

projectRouter.get('/spaces', isAuthenticated, async (req, res, next) => {
    SavedQueriesModel.getAllSpaces(req.params.projectUuid)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next);
});

projectRouter.get('/dashboards', isAuthenticated, async (req, res, next) => {
    dashboardService
        .getAllByProject(req.user!, req.params.projectUuid)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next);
});

projectRouter.post(
    '/dashboards',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        dashboardService
            .create(req.user!, req.params.projectUuid, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.post(
    '/sqlQuery',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const results: ApiSqlQueryResults =
                await projectService.runSqlQuery(
                    req.user!,
                    req.params.projectUuid,
                    req.body.sql,
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

projectRouter.get('/catalog', isAuthenticated, async (req, res, next) => {
    try {
        const results: ProjectCatalog = await projectService.getCatalog(
            req.user!,
            req.params.projectUuid,
        );
        res.json({
            status: 'ok',
            results,
        });
    } catch (e) {
        next(e);
    }
});

projectRouter.get(
    '/tablesConfiguration',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results: TablesConfiguration =
                await projectService.getTablesConfiguration(
                    req.user!,
                    req.params.projectUuid,
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

projectRouter.patch(
    '/tablesConfiguration',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const results: TablesConfiguration =
                await projectService.updateTablesConfiguration(
                    req.user!,
                    req.params.projectUuid,
                    req.body,
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
