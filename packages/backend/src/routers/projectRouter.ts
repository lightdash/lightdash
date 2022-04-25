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
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import Logger from '../logger';
import { savedChartModel } from '../models/models';
import {
    dashboardService,
    projectService,
    savedChartsService,
} from '../services/services';

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
                additionalMetrics: body.additionalMetrics,
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
                additionalMetrics: body.additionalMetrics,
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
            const jobUuid = uuidv4();

            projectService.startJob(jobUuid, req.params.projectUuid); // So we don't get a 404 when requesting this jobUuid
            projectService
                .getAllExplores(
                    req.user!,
                    req.params.projectUuid,
                    jobUuid,
                    true,
                )
                .catch((e) => Logger.error(`Error running refresh: ${e}`));
            res.json({
                status: 'ok',
                results: {
                    jobUuid,
                },
            });
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
        if (req.query.duplicateFrom) {
            savedChartsService
                .duplicate(
                    req.user!,
                    req.params.projectUuid,
                    req.query.duplicateFrom.toString(),
                )
                .then((results) => {
                    res.json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        } else {
            savedChartsService
                .create(req.user!, req.params.projectUuid, req.body)
                .then((results) => {
                    res.json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        }
    },
);

projectRouter.get('/spaces', isAuthenticated, async (req, res, next) => {
    savedChartModel
        .getAllSpaces(req.params.projectUuid)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next);
});

projectRouter.get('/dashboards', isAuthenticated, async (req, res, next) => {
    const chartUuid: string | undefined =
        typeof req.query.chartUuid === 'string'
            ? req.query.chartUuid.toString()
            : undefined;
    dashboardService
        .getAllByProject(req.user!, req.params.projectUuid, chartUuid)
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
        if (req.query.duplicateFrom) {
            dashboardService
                .duplicate(
                    req.user!,
                    req.params.projectUuid,
                    req.query.duplicateFrom.toString(),
                )
                .then((results) => {
                    res.status(201).json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        } else {
            dashboardService
                .create(req.user!, req.params.projectUuid, req.body)
                .then((results) => {
                    res.status(201).json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        }
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

projectRouter.get(
    '/hasSavedCharts',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await projectService.hasSavedCharts(
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
