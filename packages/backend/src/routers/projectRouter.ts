import {
    ApiCompiledQueryResults,
    ApiExploreResults,
    ApiExploresResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    DimensionType,
    formatTimestamp,
    getItemLabel,
    getItemMap,
    getRequestMethod,
    isField,
    LightdashRequestMethodHeader,
    MetricQuery,
    NotFoundError,
    ProjectCatalog,
    TablesConfiguration,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import express from 'express';
import * as fs from 'fs/promises';
import moment from 'moment';
import { nanoid } from 'nanoid';
import path from 'path';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import {
    dashboardService,
    projectService,
    s3Service,
    savedChartsService,
    searchService,
    spaceService,
} from '../services/services';

export const projectRouter = express.Router({ mergeParams: true });

projectRouter.get(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

projectRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        projectService
            .update(
                req.params.projectUuid,
                req.user!,
                req.body,
                getRequestMethod(req.header(LightdashRequestMethodHeader)),
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

projectRouter.get('/search/:query', isAuthenticated, async (req, res, next) => {
    try {
        const results = await searchService.getSearchResults(
            req.user!,
            req.params.projectUuid,
            req.params.query,
        );
        res.json({ status: 'ok', results });
    } catch (e) {
        next(e);
    }
});

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
            const { csvLimit } = body;
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
                csvLimit,
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
    '/explores/:exploreId/downloadCsv',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { body } = req;
            const { csvLimit, onlyRaw } = body;
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
                csvLimit,
            );

            const explore = await projectService.getExplore(
                req.user!,
                req.params.projectUuid,
                req.params.exploreId,
            );
            const itemMap = getItemMap(
                explore,
                metricQuery.additionalMetrics,
                metricQuery.tableCalculations,
            );
            // Ignore fields from results that are not selected in metrics or dimensions
            const selectedFieldIds = [
                ...body.metrics,
                ...body.dimensions,
                ...body.tableCalculations.map((tc: any) => tc.name),
            ];
            const csvHeader = Object.keys(results.rows[0])
                .filter((id) => selectedFieldIds.includes(id))
                .map((id) => getItemLabel(itemMap[id]));
            const csvBody = results.rows.map((row) =>
                Object.keys(row)
                    .filter((id) => selectedFieldIds.includes(id))
                    .map((id) => {
                        const rowData = row[id];
                        const item = itemMap[id];
                        if (
                            isField(item) &&
                            item.type === DimensionType.TIMESTAMP
                        ) {
                            return moment(rowData.value.raw).format(
                                'YYYY-MM-DD HH:mm:ss',
                            );
                        }
                        if (isField(item) && item.type === DimensionType.DATE) {
                            return moment(rowData.value.raw).format(
                                'YYYY-MM-DD',
                            );
                        }
                        if (onlyRaw) {
                            return rowData.value.raw;
                        }
                        return rowData.value.formatted;
                    }),
            );

            const csvContent: string = await new Promise((resolve, reject) => {
                stringify(
                    [csvHeader, ...csvBody],
                    {
                        delimiter: ',',
                    },
                    (err, output) => {
                        if (err) {
                            reject(new Error(err.message));
                        }
                        resolve(output);
                    },
                );
            });

            const fileId = `csv-${nanoid()}.csv`;

            let fileUrl;
            try {
                fileUrl = await s3Service.uploadCsv(csvContent, fileId);
            } catch (e) {
                // Can't store file in S3, storing locally
                await fs.writeFile(`/tmp/${fileId}`, csvContent, 'utf-8');
                fileUrl = `${lightdashConfig.siteUrl}/api/v1/projects/${req.params.projectUuid}/csv/${fileId}`;
            }

            res.json({
                status: 'ok',
                results: {
                    url: fileUrl,
                },
            });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get(
    '/csv/:fileId',

    async (req, res, next) => {
        if (!req.params.fileId.startsWith('csv-')) {
            throw new NotFoundError(`File not found ${req.params.fileId}`);
        }
        try {
            const filePath = path.join('/tmp', req.params.fileId);
            res.sendFile(filePath);
        } catch (error) {
            next(error);
        }
    },
);

projectRouter.get(
    '/field/:fieldId/search',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const value: string =
                typeof req.query.value === 'string'
                    ? req.query.value.toString()
                    : '';
            const limit: number =
                typeof req.query.limit === 'string'
                    ? parseInt(req.query.limit.toString(), 10)
                    : 10;
            const results: Array<any> =
                await projectService.searchFieldUniqueValues(
                    req.user!,
                    req.params.projectUuid,
                    req.params.fieldId,
                    value,
                    limit,
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
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const results = await projectService.compileProject(
                req.user!,
                req.params.projectUuid,
                getRequestMethod(req.header(LightdashRequestMethodHeader)),
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
    allowApiKeyAuthentication,
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

projectRouter.patch(
    '/saved',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        savedChartsService
            .updateMultiple(req.user!, req.params.projectUuid, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.get(
    '/spaces',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        spaceService
            .getAllSpaces(req.params.projectUuid, req.user!)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);
projectRouter.get(
    '/spaces/:spaceUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        spaceService
            .getSpace(req.params.projectUuid, req.user!, req.params.spaceUuid)
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
    '/spaces',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .createSpace(req.params.projectUuid, req.user!, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.delete(
    '/spaces/:spaceUUid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .deleteSpace(req.user!, req.params.spaceUUid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.patch(
    '/spaces/:spaceUUid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .updateSpace(req.user!, req.params.spaceUUid, req.body)
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
    '/spaces/:spaceUUid/share',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .addSpaceShare(req.user!, req.params.spaceUUid, req.body.userUuid)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next);
    },
);

projectRouter.delete(
    '/spaces/:spaceUUid/share/:userUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .removeSpaceShare(
                req.user!,
                req.params.spaceUUid,
                req.params.userUuid,
            )
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next);
    },
);

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
    allowApiKeyAuthentication,
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

projectRouter.patch(
    '/dashboards',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        dashboardService
            .updateMultiple(req.user!, req.params.projectUuid, req.body)
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
