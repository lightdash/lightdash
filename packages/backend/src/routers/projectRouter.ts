import {
    ApiCompiledQueryResults,
    ApiExploreResults,
    ApiExploresResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    MetricQuery,
    ProjectCatalog,
    TablesConfiguration,
} from '@lightdash/common';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import {
    dashboardService,
    projectService,
    savedChartsService,
} from '../services/services';

export const projectRouter = express.Router({ mergeParams: true });

projectRouter.get('/', isAuthenticated, async (req, res, next) => {
    try {
        res.json({
            status: 'ok',
            results: await projectService.getProject(
                req.params.projectUuid,
                req.user!,
            ),
        });
    } catch (e) {
        next(e);
    }
});

projectRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .update(req.params.projectUuid, req.user!, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.put(
    '/explores',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .setExplores(req.params.projectUuid, req.body)
            .then(() => {
                res.json({
                    status: 'ok',
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
            const results = await projectService.compileProject(
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
    savedChartsService
        .getAllSpaces(req.params.projectUuid, req.user!)
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

projectRouter.get('/access', isAuthenticated, async (req, res, next) => {
    try {
        const results = await projectService.getProjectAccess(
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

projectRouter.post('/access', isAuthenticated, async (req, res, next) => {
    try {
        const results = await projectService.createProjectAccess(
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
});
projectRouter.patch(
    '/access/:userUuid',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await projectService.updateProjectAccess(
                req.user!,
                req.params.projectUuid,
                req.params.userUuid,
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
projectRouter.delete(
    '/access/:userUuid',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await projectService.deleteProjectAccess(
                req.user!,
                req.params.projectUuid,
                req.params.userUuid,
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
