import {
    ApiCompiledQueryResults,
    ApiExploreResults,
    ApiExploresResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    getRequestMethod,
    LightdashRequestMethodHeader,
    MetricQuery,
    NotFoundError,
    ProjectCatalog,
    TablesConfiguration,
} from '@lightdash/common';
import express from 'express';
import fs from 'fs';

import path from 'path';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import { CsvService } from '../services/CsvService/CsvService';
import {
    csvService,
    dashboardService,
    projectService,
    savedChartsService,
    searchService,
    spaceService,
} from '../services/services';

const { Readable } = require('stream');

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
    allowApiKeyAuthentication,
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

projectRouter.get(
    '/search/:query',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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

projectRouter.get(
    '/explores',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

projectRouter.get(
    '/explores/:exploreId',
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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
    '/explores/:exploreId/downloadCsv',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        const { body } = req;

        try {
            const {
                onlyRaw,
                csvLimit,
                showTableNames,
                customLabels,
                columnOrder,
            } = body;
            const { projectUuid, exploreId } = req.params;

            const metricQuery: MetricQuery = {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
                tableCalculations: body.tableCalculations,
                additionalMetrics: body.additionalMetrics,
            };

            const { jobId } = await CsvService.scheduleDownloadCsv(req.user!, {
                userUuid: req.user?.userUuid!,
                projectUuid,
                exploreId,
                metricQuery,
                onlyRaw,
                csvLimit,
                showTableNames,
                customLabels,
                columnOrder,
            });

            res.json({
                status: 'ok',
                results: {
                    jobId,
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
        try {
            const { fileId } = req.params;

            if (!fileId.startsWith('csv-') || !fileId.endsWith('.csv')) {
                throw new NotFoundError(`CSV file not found ${fileId}`);
            }
            const sanitizedFileId = fileId.replace('..', '');

            const filePath = path.join('/tmp', sanitizedFileId);
            if (!fs.existsSync(filePath)) {
                const error = `This file ${fileId} doesn't exist on this server, this may be happening if you are running multiple containers or because files are not persisted. You can check out our docs to learn more on how to enable cloud storage: https://docs.lightdash.com/self-host/customize-deployment/configure-lightdash-to-use-external-object-storage`;
                throw new NotFoundError(error);
            }
            res.set('Content-Type', 'text/csv');
            res.set('Content-Disposition', `attachment; filename=${fileId}`);
            res.sendFile(filePath);
        } catch (error) {
            next(error);
        }
    },
);

projectRouter.get(
    '/field/:fieldId/search',
    allowApiKeyAuthentication,
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
                    : 100;

            const table =
                typeof req.query.table === 'string' ? req.query.table : '';

            const results = {
                search: value,
                results: await projectService.searchFieldUniqueValues(
                    req.user!,
                    req.params.projectUuid,
                    table,
                    req.params.fieldId,
                    value,
                    limit,
                ),
            };

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
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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

projectRouter.patch(
    '/spaces/:spaceUuid/pinning',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        spaceService
            .togglePinning(req.user!, req.params.spaceUuid)
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
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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

projectRouter.get(
    '/dashboards',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

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
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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

projectRouter.post(
    '/sqlRunner/downloadCsv',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { customLabels, sql } = req.body;
            const { projectUuid } = req.params;

            const fileUrl = await csvService.downloadSqlCsv({
                user: req.user!,
                projectUuid,
                sql,
                customLabels,
            });
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
    '/catalog',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

projectRouter.get(
    '/tablesConfiguration',
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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
    allowApiKeyAuthentication,
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

projectRouter.get(
    '/access',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
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
    },
);

projectRouter.post(
    '/access',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
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
    },
);
projectRouter.patch(
    '/access/:userUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
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
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
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
